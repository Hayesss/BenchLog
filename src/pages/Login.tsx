import { useMemo } from 'react'

function getOAuthUrl() {
  const kimiAuthUrl = import.meta.env.VITE_KIMI_AUTH_URL;
  const appID = import.meta.env.VITE_APP_ID;
  const redirectUri = `${window.location.origin}/api/oauth/callback`;
  const state = btoa(redirectUri);

  const url = new URL(`${kimiAuthUrl}/api/oauth/authorize`);
  url.searchParams.set("client_id", appID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "profile");
  url.searchParams.set("state", state);

  return url.toString();
}

/* ------------------------------------------------------------------ */
/* 背景装饰：DNA 双螺旋波形（仿 Benchling 登录页的科学感曲线）            */
/* 两条错相正弦 + 横档连线 + 端点圆点，低透明度 bench 色，斜向穿越画面    */
/* ------------------------------------------------------------------ */

const W = 1600;
const H = 900;
const AMP = 130;
const CYCLES = 1.6;

function wave(phase: number): string {
  const pts: string[] = [];
  for (let x = 0; x <= W; x += 10) {
    const y = H / 2 + Math.sin((x / W) * Math.PI * 2 * CYCLES + phase) * AMP;
    pts.push(`${x === 0 ? 'M' : 'L'}${x},${y.toFixed(1)}`);
  }
  return pts.join(' ');
}

function HelixBackground() {
  const { rungs, dots } = useMemo(() => {
    const rungs: { x: number; y1: number; y2: number }[] = [];
    const dots: { x: number; y: number; r: number; o: number }[] = [];
    for (let i = 1; i <= 9; i++) {
      const x = (i / 10) * W;
      const t = (x / W) * Math.PI * 2 * CYCLES;
      const y1 = H / 2 + Math.sin(t) * AMP;
      const y2 = H / 2 + Math.sin(t + Math.PI) * AMP;
      rungs.push({ x, y1, y2 });
      // 横档中点圆点（交替大小/透明度，营造节奏）
      dots.push({ x, y: (y1 + y2) / 2, r: i % 3 === 0 ? 10 : 6, o: i % 3 === 0 ? 0.5 : 0.32 });
    }
    // 波峰/波谷端点大圆
    for (let i = 0; i <= 3; i++) {
      const x = ((i + 0.5) / 4) * W * (1 / CYCLES) * CYCLES;
      const t = (x / W) * Math.PI * 2 * CYCLES;
      dots.push({ x, y: H / 2 + Math.sin(t) * AMP, r: 13, o: 0.45 });
      dots.push({ x, y: H / 2 + Math.sin(t + Math.PI) * AMP, r: 13, o: 0.45 });
    }
    return { rungs, dots };
  }, []);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid slice"
      className="pointer-events-none absolute inset-0 h-full w-full -rotate-6 scale-125"
      aria-hidden="true"
    >
      <path d={wave(0)} fill="none" stroke="#3E7C6B" strokeOpacity="0.28" strokeWidth="2.5" />
      <path d={wave(Math.PI)} fill="none" stroke="#3E7C6B" strokeOpacity="0.2" strokeWidth="2.5" />
      {rungs.map((r, i) => (
        <line
          key={i}
          x1={r.x}
          y1={r.y1}
          x2={r.x}
          y2={r.y2}
          stroke="#3E7C6B"
          strokeOpacity="0.14"
          strokeWidth="1.5"
        />
      ))}
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={d.r} fill="#3E7C6B" fillOpacity={d.o} />
      ))}
    </svg>
  );
}

const FEATURES = ['实验记录', '方法库', '样本盒', '小鼠台账', '生信分析', 'AI 助手'];

export default function Login() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-paper via-bench-wash/50 to-paper">
      <HelixBackground />

      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center px-4 py-10">
        {/* 登录卡片（Benchling 式：居中白卡 + 柔和大阴影） */}
        <div className="w-full max-w-[400px] rounded-2xl border border-line/60 bg-surface/95 p-8 shadow-[0_18px_60px_-12px_rgba(43,58,53,0.18)] backdrop-blur">
          <div className="flex flex-col items-center">
            <img src="/logo.svg" alt="BenchLog" className="h-12 w-12" />
            <h1 className="mt-3 font-display text-[24px] font-bold tracking-tight text-ink">
              BenchLog
            </h1>
            <p className="mt-1.5 text-center text-[13px] leading-[19px] text-ink-mute">
              湿实验 × 生信的一体化记录台
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              window.location.href = getOAuthUrl();
            }}
            className="mt-7 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-bench-deep text-[14.5px] font-medium text-white shadow-card transition-all duration-150 hover:-translate-y-px hover:bg-[#2F6355] active:translate-y-0"
          >
            <svg viewBox="0 0 24 24" className="h-4.5 w-4.5 h-[18px] w-[18px]" fill="currentColor" aria-hidden="true">
              <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2Zm0 3.2A6.8 6.8 0 1 1 5.2 12 6.8 6.8 0 0 1 12 5.2Zm0 2.6A4.2 4.2 0 1 0 16.2 12 4.2 4.2 0 0 0 12 7.8Z" />
            </svg>
            使用 Kimi 账号登录
          </button>

          {/* 功能速览 */}
          <div className="mt-7 border-t border-line/70 pt-5">
            <p className="caption-en text-center">一个工作台 THIS IS BENCHLOG</p>
            <div className="mt-2.5 flex flex-wrap justify-center gap-1.5">
              {FEATURES.map((f) => (
                <span
                  key={f}
                  className="rounded-full bg-paper px-2.5 py-1 text-[11.5px] text-ink-soft"
                >
                  {f}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* 卡片下方辅助说明（Benchling 式小字） */}
        <p className="mt-5 text-center text-[12.5px] text-ink-mute">
          首次登录将自动创建你的专属工作台，数据仅自己可见
        </p>
      </div>
    </div>
  );
}
