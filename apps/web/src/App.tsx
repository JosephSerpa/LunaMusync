import { useEffect, useState } from "react";
import { api } from "./api";
import { AuthScreen } from "./components/AuthScreen";
import { MoonIcon } from "./components/MoonIcon";
import { LibraryApp } from "./LibraryApp";
import type { AppConfig, Session } from "./types";

const defaultConfig: AppConfig = { managed: false, setupRequired: false };

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [config, setConfig] = useState<AppConfig>(defaultConfig);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    Promise.all([api.config(), api.session()]).then(([appConfig, result]) => {
      setConfig(appConfig);
      if (result.authenticated) setSession(result as Session);
    }).catch(() => undefined).finally(() => setChecking(false));
  }, []);

  const connect = async (serverUrl: string, username: string, password: string) => {
    setSession(await api.connect(serverUrl, username, password));
  };

  const setup = async (username: string, password: string) => {
    setSession(await api.setup(username, password));
    setConfig((current) => ({ ...current, setupRequired: false }));
  };

  const demo = async () => {
    await api.demo();
    setSession({
      authenticated: true,
      username: "Explorador",
      serverUrl: "demo",
      managed: false,
      demo: true,
      server: { name: "Luna Demo", version: "1.0", apiVersion: "demo" },
    });
  };

  const logout = () => {
    if (!session?.demo) void api.disconnect().catch(() => undefined);
    setSession(null);
  };

  if (checking) return <div className="app-loading"><MoonIcon size={48} /><span>luna</span><i /></div>;
  if (!session) return <AuthScreen config={config} onConnect={connect} onSetup={setup} onDemo={demo} />;
  return <LibraryApp key={`${session.serverUrl}:${session.username}`} session={session} onLogout={logout} />;
}
