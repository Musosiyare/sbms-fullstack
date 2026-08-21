import { createContext, useContext, useEffect, useState } from "react";
import api, { TOKEN_KEY, USER_KEY, SCHOOL_KEY } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const stored = localStorage.getItem(USER_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [school, setSchool] = useState(() => {
    const stored = localStorage.getItem(SCHOOL_KEY);
    return stored ? JSON.parse(stored) : null;
  });
  const [loading, setLoading] = useState(false);

  // Cached in localStorage (name + logoUrl only) so the sidebar/header logo
  // renders instantly on reload instead of flashing the fallback icon while
  // this refetches in the background.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api
      .get("/reference/school")
      .then(({ data }) => {
        if (cancelled) return;
        setSchool(data);
        localStorage.setItem(SCHOOL_KEY, JSON.stringify(data));
      })
      .catch(() => {}); // non-critical — sidebar/header just fall back to the icon
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  async function login(email, password) {
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setUser(data.user);
      return data.user;
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(SCHOOL_KEY);
    setUser(null);
    setSchool(null);
  }

  // Merges a partial update into the stored user — e.g. clearing
  // mustChangePassword right after a successful change, without a full
  // re-login.
  function updateUser(patch) {
    setUser((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  }

  return (
    <AuthContext.Provider value={{ user, school, login, logout, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
