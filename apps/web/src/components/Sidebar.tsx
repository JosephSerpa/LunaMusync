import { Disc3, Home, Library, ListMusic, LogOut, Music2, WandSparkles } from "lucide-react";
import type { LibraryView, Session } from "../types";
import { MoonIcon } from "./MoonIcon";

const items = [
  { id: "home" as const, label: "Inicio", icon: Home },
  { id: "albums" as const, label: "Álbumes", icon: Disc3 },
  { id: "songs" as const, label: "Canciones", icon: Music2 },
  { id: "playlists" as const, label: "Listas", icon: ListMusic },
];

interface SidebarProps {
  view: LibraryView;
  onView: (view: LibraryView) => void;
  session: Session;
  onLogout: () => void;
}

export function Sidebar({ view, onView, session, onLogout }: SidebarProps) {
  const navigation = session.managed && !session.demo ? [...items, { id: "editor" as const, label: "Editor", icon: WandSparkles }] : items;
  return (
    <>
      <aside className="sidebar">
        <div className="brand"><MoonIcon size={31} /><span>luna</span></div>
        <nav className="main-nav" aria-label="Biblioteca">
          <p className="nav-caption">TU BIBLIOTECA</p>
          {navigation.map((item) => (
            <button key={item.id} className={view === item.id ? "nav-item active" : "nav-item"} onClick={() => onView(item.id)}>
              <item.icon size={20} strokeWidth={1.8} /><span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="server-card">
            <span className="server-card-icon"><Library size={19} /></span>
            <div><strong>{session.demo ? "Luna Demo" : session.managed ? "Luna Musync" : session.server.name}</strong><span>{session.demo ? "Biblioteca de demostración" : session.username}</span></div>
            <i title="Servidor conectado" />
          </div>
          <button className="logout-button" onClick={onLogout}><LogOut size={17} />Cerrar sesión</button>
        </div>
      </aside>
      <nav className="mobile-nav" aria-label="Biblioteca">
        {navigation.map((item) => (
          <button key={item.id} className={view === item.id ? "active" : ""} onClick={() => onView(item.id)}>
            <item.icon size={21} /><span>{item.label}</span>
          </button>
        ))}
      </nav>
    </>
  );
}
