import axios from "axios";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:4100/api",
});

// Deliberately different localStorage keys from the main school-system
// frontend ("sbms_token"/"sbms_user" vs its "token"/"user") — if someone
// has both apps open in the same browser, logging out of one must never
// touch the other's session.
const TOKEN_KEY = "sbms_token";
const USER_KEY = "sbms_user";

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// A regular 401 (missing/expired/invalid token) always meant "kick back to
// login" — see below. These two codes get the exact same treatment even
// though the server answers with 403: they mean the account or the whole
// school was deactivated in the main system while this session was still
// open, so the session is just as dead as an expired token. Without this,
// someone already logged in would keep seeing whatever was last loaded and
// only find out something was wrong the next time an action failed, one
// confusing error at a time, without ever being told why or moved off the
// page they were on.
const SESSION_KILLED_CODES = ["ACCOUNT_SUSPENDED", "SCHOOL_DEACTIVATED", "NO_SBMS_ROLE"];
const LOGIN_NOTICE_KEY = "sbms_login_notice";

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const apiError = err.response?.data?.error;
    const status = err.response?.status;
    const sessionKilled = status === 401 || (status === 403 && SESSION_KILLED_CODES.includes(apiError?.code));

    if (sessionKilled && window.location.pathname !== "/login") {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      // Stashed for the Login page to show as soon as it mounts — the
      // redirect below is a full page load, so React state can't carry it.
      if (apiError?.message) sessionStorage.setItem(LOGIN_NOTICE_KEY, apiError.message);
      window.location.href = "/login";
    }

    if (apiError) {
      const wrapped = new Error(apiError.message || "Something went wrong");
      wrapped.code = apiError.code;
      wrapped.field = apiError.field;
      return Promise.reject(wrapped);
    }
    return Promise.reject(err);
  }
);

export { TOKEN_KEY, USER_KEY, LOGIN_NOTICE_KEY };
export default api;
