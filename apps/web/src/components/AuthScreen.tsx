import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, Moon, Play, Server, ShieldCheck } from "lucide-react";
import type { AppConfig } from "../types";
import { MoonIcon } from "./MoonIcon";

interface AuthScreenProps {
  config: AppConfig;
  onConnect: (serverUrl: string, username: string, password: string) => Promise<void>;
  onSetup: (username: string, password: string) => Promise<void>;
  onDemo: () => Promise<void>;
}

export function AuthScreen({ config, onConnect, onSetup, onDemo }: AuthScreenProps) {
  const [serverUrl, setServerUrl] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState<"server" | "setup" | "demo" | null>(null);
  const [error, setError] = useState("");
  const firstTime = config.managed && config.setupRequired;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    if (firstTime && password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setLoading(firstTime ? "setup" : "server");
    try {
      if (firstTime) await onSetup(username, password);
      else await onConnect(config.managed ? "internal" : serverUrl, username, password);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : firstTime ? "No se pudo crear tu espacio musical." : "No se pudo conectar.");
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
          <p className="eyebrow">{firstTime ? "BIENVENIDO A TU UNIVERSO MUSICAL" : "TU MÚSICA. TU UNIVERSO."}</p>
          <h1>{firstTime ? <>Tu música.<br />Tu espacio Luna.</> : <>Una noche entera<br />para escuchar.</>}</h1>
          <p>{firstTime ? "Crea tu cuenta personal para empezar. Tus bibliotecas seleccionadas se indexarán automáticamente." : "Tu biblioteca OpenSubsonic con la calma, el detalle y la identidad de LunaPlayer."}</p>
        </div>
        <div className="auth-benefit"><ShieldCheck size={18} /><span>{firstTime ? "Tus archivos permanecen intactos y bajo tu control" : "Conexión directa y credenciales protegidas"}</span></div>
      </section>
      <section className="auth-panel">
        <div className="auth-panel-heading">
          <span className="auth-server-icon">{firstTime ? <Moon size={22} /> : <Server size={22} />}</span>
          <div><h2>{firstTime ? "Crea tu espacio musical" : config.managed ? "Tu servidor Luna" : "Conecta tu biblioteca"}</h2><p>{firstTime ? "Este será tu usuario administrador" : config.managed ? "Tu música, siempre contigo" : "Navidrome, Subsonic, Airsonic o Gonic"}</p></div>
        </div>
        <form onSubmit={submit} className="auth-form">
          {!config.managed && <label>Dirección del servidor<input type="url" required placeholder="https://musica.tudominio.com" value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} /></label>}
          <div className={firstTime ? "auth-fields" : "auth-fields-row"}>
            <label>Usuario<input required autoComplete="username" pattern="[A-Za-z0-9]+" maxLength={64} title="Usa únicamente letras y números, sin espacios" placeholder={firstTime ? "Elige tu usuario" : undefined} value={username} onChange={(event) => setUsername(event.target.value)} /></label>
            <label>Contraseña<input required minLength={firstTime ? 8 : undefined} maxLength={firstTime ? 256 : undefined} type="password" autoComplete={firstTime ? "new-password" : "current-password"} placeholder={firstTime ? "Mínimo 8 caracteres" : undefined} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
            {firstTime && <label>Confirma tu contraseña<input required minLength={8} maxLength={256} type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>}
          </div>
          {firstTime && <p className="setup-note">Solo necesitas hacerlo una vez. Después entrarás con este usuario y esta contraseña.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button button-primary button-full" disabled={loading !== null}>
            {loading === "server" || loading === "setup" ? <LoaderCircle className="spin" size={19} /> : <ArrowRight size={19} />}
            {loading === "setup" ? "Preparando tu espacio…" : loading === "server" ? "Conectando…" : firstTime ? "Crear mi espacio musical" : "Entrar en mi biblioteca"}
          </button>
        </form>
        {!firstTime && <>
          <div className="auth-divider"><span>o explora primero</span></div>
          <button className="button button-glass button-full" onClick={demo} disabled={loading !== null}>
            {loading === "demo" ? <LoaderCircle className="spin" size={18} /> : <Play size={18} />}
            Abrir la demostración
          </button>
          <p className="auth-footnote">La demo incluye audio sintético y no necesita una cuenta.</p>
        </>}
      </section>
    </main>
  );
}
