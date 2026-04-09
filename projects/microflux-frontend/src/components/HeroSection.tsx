import React, { useRef, useEffect } from 'react';

interface HeroSectionProps {
  onNavigate: (page: string) => void;
}

const HeroSection: React.FC<HeroSectionProps> = ({ onNavigate }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationId: number;
    let time = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth * 2;
      canvas.height = canvas.offsetHeight * 2;
    };

    const draw = () => {
      resize();
      const w = canvas.width;
      const h = canvas.height;

      ctx.clearRect(0, 0, w, h);

      const cellSize = 18;
      const cols = Math.ceil(w / cellSize);
      const rows = Math.ceil(h / cellSize);

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const px = x * cellSize;
          const py = y * cellSize;

          // Create flowing mosaic pattern
          const cx = x / cols;
          const cy = y / rows;

          // Diagonal wave
          const wave1 = Math.sin((cx * 4 + cy * 3 + time * 0.3) * Math.PI) * 0.5 + 0.5;
          // Circular pattern
          const dist = Math.sqrt(Math.pow(cx - 0.4, 2) + Math.pow(cy - 0.5, 2));
          const wave2 = Math.sin((dist * 6 - time * 0.5) * Math.PI) * 0.5 + 0.5;

          const combined = wave1 * 0.6 + wave2 * 0.4;

          // Threshold for pixel on/off
          const threshold = 0.35 + Math.sin(time * 0.2 + x * 0.1) * 0.15;

          if (combined > threshold) {
            // White/bright pixel
            const brightness = Math.min(1, (combined - threshold) * 3);
            const alpha = brightness * 0.9;

            // Some pixels get blue tint
            const isBlue = Math.sin(x * 0.7 + y * 0.5 + time * 0.4) > 0.6;

            if (isBlue) {
              ctx.fillStyle = `rgba(37, 99, 235, ${alpha * 0.7})`;
            } else {
              ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            }

            // Leave small gaps between cells
            ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
          }

          // Cross/plus patterns scattered
          if (combined > 0.7 && Math.random() > 0.997) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            const cs = cellSize * 3;
            // Horizontal bar
            ctx.fillRect(px - cs / 2 + cellSize / 2, py + cellSize / 2 - 2, cs, 4);
            // Vertical bar
            ctx.fillRect(px + cellSize / 2 - 2, py - cs / 2 + cellSize / 2, 4, cs);
          }
        }
      }

      time += 0.008;
      animationId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animationId);
  }, []);

  return (
    <section className="hero pixel-bg">
      <div className="hero-content animate-slideUp">
        <p className="hero-subtitle">
          Powered by Algorand • Groq AI • CoinGecko
        </p>
        <h1 className="hero-title">
          VISUAL<br />
          WORKFLOW<br />
          BUILDER.
        </h1>
        <p className="hero-desc">
          Build, simulate, and execute on-chain workflows with drag-and-drop.
          AI-assisted. Production-ready. Built for retail traders who know what they're doing.
        </p>
        <div className="hero-actions">
          <button className="btn btn-primary btn-lg" onClick={() => onNavigate('builder')}>
            START BUILDING
          </button>
          <button className="btn btn-outline btn-lg btn-arrow" onClick={() => onNavigate('marketplace')}>
            BROWSE TEMPLATES
          </button>
        </div>
      </div>

      <div className="hero-mosaic">
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      </div>
    </section>
  );
};

export default HeroSection;
