import React from 'react';
import { Database, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import BotMascot from './BotMascot';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const location = useLocation();

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/30 selection:text-white relative">
      {/* Header */}
      <header className="border-b border-border bg-card/70 backdrop-blur-md sticky top-0 z-50 shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20 group-hover:scale-105 transition-transform duration-300">
              <Database className="w-5 h-5 text-primary-foreground" />
            </div>
            <div className="flex flex-col">
              <span className="font-bold text-lg leading-none tracking-tight">DHsystem</span>
              <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mt-0.5">Knowledge Hub</span>
            </div>
          </Link>
          
          <nav className="flex items-center gap-6">
             <Link 
              to="/" 
              className={`text-sm font-medium transition-all duration-200 px-3 py-1.5 rounded-md ${
                location.pathname === '/' ? 'bg-secondary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              Dashboard
            </Link>
            <Link 
              to="/settings"
              className={`text-sm font-medium transition-all duration-200 px-3 py-1.5 rounded-md ${
                location.pathname === '/settings' ? 'bg-secondary text-white' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              Cài đặt
            </Link>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/50 text-xs font-medium text-secondary-foreground border border-green-500/20 shadow-[0_0_10px_rgba(34,197,94,0.1)]">
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </div>
              <span className="text-green-500">MCP Active</span>
            </div>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 container mx-auto px-4 py-8 animate-in fade-in duration-500">
        {children}
      </main>

      {/* AI Bot Mascot (Always present) */}
      <BotMascot />

      {/* Footer */}
      <footer className="border-t border-border py-8 bg-card mt-auto">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-muted-foreground">
            Developed & Copyright &copy; 2025 by <span className="font-semibold text-foreground">DHsystem</span>
          </p>
          <p className="text-xs text-slate-600 mt-2">
            Powered by Next.js, Supabase, and Google Gemini 2.0
          </p>
        </div>
      </footer>
    </div>
  );
};

export default Layout;