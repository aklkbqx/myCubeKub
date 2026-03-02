import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
import { Blocks, ShieldCheck, RadioTower, Wrench } from "lucide-react";
import { LoadingOverlay } from "@/components/LoadingOverlay";

export function Login() {
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.auth.login(username, password);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Something went wrong");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen px-4 py-10">
      {/* Background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="page-shell flex min-h-[calc(100vh-5rem)] items-center">
        <div className="grid w-full gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="hero-panel p-6 sm:p-8">
            <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-brand-500/10 to-transparent" />
            <div className="absolute -right-10 top-10 h-44 w-44 rounded-full bg-brand-500/10 blur-3xl" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-5">
                <div className="inline-flex items-center justify-center rounded-3xl border border-brand-500/20 bg-brand-600/15 p-5">
                  <Blocks size={28} className="text-brand-300" />
                </div>
                <div className="flex flex-col">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-brand-300/80">Minecraft Control Panel</p>
                  <h1 className="text-3xl font-bold text-surface-50">
                    my<span className="text-brand-400">Cube</span>Kub
                  </h1>
                </div>
              </div>

              <h1 className="max-w-xl text-4xl font-bold text-surface-50 sm:text-5xl">
                Build, launch, and manage every server from one game-ready panel.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-surface-300">
                myCubeKub is a Minecraft-inspired operations workspace for hosting worlds, tuning configuration, and monitoring runtime activity with less friction.
              </p>

              {/* <div className="mt-8 grid gap-4 sm:grid-cols-3">
                <div className="minecraft-card p-4">
                  <div className="relative">
                    <ShieldCheck size={18} className="text-emerald-300" />
                    <h3 className="mt-3 text-base font-semibold text-surface-50">Protected</h3>
                    <p className="mt-2 text-sm text-surface-300">Safe server setup with duplicate port protection and isolated runtime control.</p>
                  </div>
                </div>
                <div className="minecraft-card p-4">
                  <div className="relative">
                    <RadioTower size={18} className="text-cyan-300" />
                    <h3 className="mt-3 text-base font-semibold text-surface-50">Connected</h3>
                    <p className="mt-2 text-sm text-surface-300">Track live status, memory usage, and server access from a single dashboard.</p>
                  </div>
                </div>
                <div className="minecraft-card p-4">
                  <div className="relative">
                    <Wrench size={18} className="text-amber-300" />
                    <h3 className="mt-3 text-base font-semibold text-surface-50">Configurable</h3>
                    <p className="mt-2 text-sm text-surface-300">Adjust versions, memory, files, and properties without leaving the workspace.</p>
                  </div>
                </div>
              </div> */}
            </div>
          </section>

          <div className="minecraft-card animate-slide-up p-6 sm:p-8">
            {loading && <LoadingOverlay message="Signing in" subtle />}
            <div className="relative">
              <div className="mb-6">
                <p className="text-[11px] uppercase tracking-[0.24em] text-brand-300/80">Operator Access</p>
                <h2 className="mt-2 text-3xl font-bold text-surface-50">Sign In</h2>
                <p className="mt-2 text-sm text-surface-400">Enter your credentials to access the server control room.</p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {error && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                    {error}
                  </div>
                )}

                <div>
                  <label
                    htmlFor="username"
                    className="mb-1.5 block text-sm font-medium text-surface-300"
                  >
                    Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter your username"
                    className="input-field w-full"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="mb-1.5 block text-sm font-medium text-surface-300"
                  >
                    Password
                  </label>
                  <input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="input-field w-full"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || !username || !password}
                  className="btn-primary w-full py-3 text-base disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="animate-spin">⟳</span> Signing in...
                    </span>
                  ) : (
                    "Sign In"
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
