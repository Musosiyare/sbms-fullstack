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

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const apiError = err.response?.data?.error;

    if (err.response?.status === 401 && window.location.pathname !== "/login") {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
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

export { TOKEN_KEY, USER_KEY };
export default api;
