import { useState, type FormEvent } from "react";
import { ArrowRight, ExternalLink, LoaderCircle, Play, Server, ShieldCheck } from "lucide-react";
import type { AppConfig } from "../types";
import { MoonIcon } from "./MoonIcon";

interface AuthScreenProps {
  config: AppConfig;
  onConnect: (serverUrl: string, username: string, password: string) => Promise<void>;
  onDemo: () => Promise<void>;
}

export function AuthScreen({ config, onConnect, onDemo }: AuthScreenProps) {
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState<"server" | "demo" | null>(null);
  const [error, setError] = useState("");

  const connect = async (event: FormEvent) => {
    event.preventDefault();
    setLoading("server");
    setError("");
    try {
      await onConnect(config.managed ? "internal" : serverUrl, username, password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo conectar.");
    } finally {
      setLoading(null);
    }
  };

  const demo = async () => {
    setLoading("demo");
    setError("");
    try {
      await onDemo();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo iniciar la demostración.");
      setLoading(null);
    }
  };

  return (
    <main className="auth-screen">
      <div className="auth-aurora auth-aurora-one" />
      <div className="auth-aurora auth-aurora-two" />
      <section className="auth-story">
        <div className="brand brand-large"><MoonIcon size={42} /><span>luna</span></div>
        <div className="auth-story-copy">
          <p className="eyebrow">TU MÚSICA. TU UNIVERSO.</p>
          <h1>Una noche entera<br />para escuchar.</h1>
          <p>Tu biblioteca OpenSubsonic con la calma, el detalle y la identidad de LunaPlayer.</p>
        </div>
        <div className="auth-benefit"><ShieldCheck size={18} /><span>Conexión directa y credenciales protegidas</span></div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-heading">
          <span className="auth-server-icon"><Server size={22} /></span>
          <div><h2>{config.managed ? "Tu servidor Luna" : "Conecta tu biblioteca"}</h2><p>{config.managed ? "Navidrome incluido y configurado" : "Navidrome, Subsonic, Airsonic o Gonic"}</p></div>
        </div>
        {config.managed && config.adminUrl && <div className="managed-server-note"><span>¿Es tu primera vez aquí? Crea el administrador de Navidrome y vuelve para iniciar sesión.</span><a href={config.adminUrl} target="_blank" rel="noreferrer">Crear administrador<ExternalLink size={14} /></a></div>}
        <form onSubmit={connect} className="auth-form">
          {!config.managed && <label>Dirección del servidor<input type="url" required placeholder="https://musica.tudominio.com" value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} /></label>}
          <div className="auth-fields-row">
            <label>Usuario<input required autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} /></label>
            <label>Contraseña<input required type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary button-full" disabled={loading !== null}>
            {loading === "server" ? <LoaderCircle className="spin" size={19} /> : <ArrowRight size={19} />}
            {loading === "server" ? "Conectando…" : "Entrar en mi biblioteca"}
          </button>
        </form>
        <div className="auth-divider"><span>o explora primero</span></div>
        <button className="button button-glass button-full" onClick={demo} disabled={loading !== null}>
          {loading === "demo" ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}
          Abrir la demostración
        </button>
        <p className="auth-footnote">La demo incluye audio sintético y no necesita una cuenta.</p>
      </section>
    </main>
  );
}
