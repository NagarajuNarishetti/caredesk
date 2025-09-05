import { useEffect, useState } from "react";
// import "@fortawesome/fontawesome-free/css/all.min.css";
import "../styles/globals.css";
import Navbar from "../components/Navbar";
import keycloak from "../lib/keycloak";

export default function MyApp({ Component, pageProps }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    keycloak
      .init({
        onLoad: "login-required",
        checkLoginIframe: false,
      })
      .then((authenticated) => {
        setIsAuthenticated(authenticated);
        if (authenticated) {
          // Store token in localStorage for API calls
          localStorage.setItem('token', keycloak.token);
          
          // Make keycloak available globally for API interceptor
          if (typeof window !== 'undefined') {
            window.keycloak = keycloak;
          }
          
          // Set up token refresh
          keycloak.onTokenExpired = () => {
            keycloak.updateToken(70).then((refreshed) => {
              if (refreshed) {
                localStorage.setItem('token', keycloak.token);
              }
            });
          };
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Keycloak init failed:", err);
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div>
      <Navbar keycloak={keycloak} />
      <Component {...pageProps} keycloak={keycloak} />
    </div>
  );
}
