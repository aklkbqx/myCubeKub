import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiError } from "@/lib/api";
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
    <div className="min-h-screen px-4 py-6 sm:py-10">
      {/* Background glow */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-600/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-cyan-500/5 rounded-full blur-[100px]" />
      </div>

      <div className="page-shell flex min-h-[calc(100vh-3rem)] items-center sm:min-h-[calc(100vh-5rem)]">
        <div className="grid w-full gap-5 lg:grid-cols-[1.2fr_0.8fr] lg:gap-6">
          <div className="order-1 minecraft-card animate-slide-up p-5 sm:p-8 lg:order-2">
            {loading && <LoadingOverlay message="Signing in" subtle />}
            <div className="relative">
              <div className="mb-6">
                <p className="text-[11px] uppercase tracking-[0.24em] text-brand-300/80">Operator Access</p>
                <h2 className="mt-2 text-2xl font-bold text-surface-50 sm:text-3xl">Sign In</h2>
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

          <section className="order-2 hero-panel p-5 sm:p-8 lg:order-1">
            <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-brand-500/10 to-transparent" />
            <div className="absolute -right-10 top-10 h-44 w-44 rounded-full bg-brand-500/10 blur-3xl" />
            <div className="relative">
              <div className="flex items-center gap-2 mb-5">
                <div className="inline-flex items-center justify-center rounded-3xl border border-brand-500/20 bg-brand-600/15 p-2">
                  <img
                    src="/logo-only.png"
                    alt="myCubeKub"
                    className="h-20 w-20 rounded-2xl overflow-hidden"
                  />
                </div>
                <div className="flex flex-col">
                  <p className="text-[11px] uppercase tracking-[0.28em] text-brand-300/80">Minecraft Control Panel</p>
                  <h1 className="text-3xl font-bold text-surface-50">
                    my<span className="text-brand-400">Cube</span>Kub
                  </h1>
                </div>
              </div>

              <h1 className="max-w-xl text-3xl font-bold text-surface-50 sm:text-5xl">
                Build, launch, and manage every server from one game-ready panel.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-surface-300 sm:leading-7">
                myCubeKub is a Minecraft-inspired operations workspace for hosting worlds, tuning configuration, and monitoring runtime activity with less friction.
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
