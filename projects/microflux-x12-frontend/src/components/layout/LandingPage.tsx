import React from 'react';
import { motion } from 'framer-motion';
import { useUIStore } from '../../stores/uiStore';
import { LayoutGrid, Play, Github, Twitter, ExternalLink, Zap } from 'lucide-react';

const LandingPage: React.FC = () => {
  const setView = useUIStore((s) => s.setView);

  const handleStart = () => {
    setView('loading');
    setTimeout(() => {
      setView('builder');
    }, 2500);
  };

  return (
    <div className="landing-container">
      {/* Background decoration */}
      <div className="landing-gradient" />
      <div className="landing-grid" />

      {/* Nav */}
      <nav className="landing-nav">
        <div className="logo-text" style={{ fontSize: 18 }}>MICROFLUX-X1</div>
        <div className="nav-links">
          <a href="#">Docs</a>
          <a href="#">Showcase</a>
          <button className="btn-minimal">GitHub</button>
        </div>
      </nav>

      {/* Hero */}
      <main className="landing-main">
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1 }}
          className="hero-content"
        >
          <div className="hero-badge">
            <Zap size={12} fill="currentColor" />
            <span>Algorand Hackathon Winner</span>
          </div>
          
          <h1 className="hero-title">
            The Visual Engine for <br />
            <span className="text-gradient">Algorand Workflows</span>
          </h1>
          
          <p className="hero-subtitle">
            Orchestrate complex on-chain logic, automate payments, and deploy smart contract executors with our zero-code visual builder.
          </p>

          <div className="hero-actions">
            <button className="btn-primary-large" onClick={handleStart}>
              Open Builder <LayoutGrid size={18} />
            </button>
            <button className="btn-secondary-large">
              View Demo <Play size={16} fill="white" />
            </button>
          </div>
        </motion.div>

        {/* Floating Preview Image or Mockup */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 1.2 }}
          className="hero-preview"
        >
          <div className="preview-window">
             <div className="preview-dot-grid" />
             <div className="preview-overlay" />
             <img src="https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&q=80&w=2832" alt="Builder Preview" />
          </div>
        </motion.div>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <div style={{ opacity: 0.4 }}>© 2024 Microflux-X1. Built for Algorand ecosystem.</div>
        <div className="footer-links">
          <Twitter size={18} />
          <Github size={18} />
        </div>
      </footer>

      <style>{`
        .landing-container {
          min-height: 100vh;
          background: #000;
          color: #fff;
          font-family: 'Inter', sans-serif;
          position: relative;
          overflow-x: hidden;
          display: flex;
          flex-direction: column;
        }
        .landing-gradient {
          position: absolute;
          top: -20%;
          left: 50%;
          transform: translateX(-50%);
          width: 1000px;
          height: 800px;
          background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
          pointer-events: none;
        }
        .landing-grid {
          position: absolute;
          inset: 0;
          background-image: 
            linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px);
          background-size: 50px 50px;
          pointer-events: none;
        }
        .landing-nav {
          padding: 32px 80px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          position: relative;
          z-index: 10;
        }
        .nav-links {
          display: flex;
          gap: 32px;
          align-items: center;
        }
        .nav-links a {
          font-size: 14px;
          color: rgba(255, 255, 255, 0.6);
          text-decoration: none;
          transition: color 0.2s;
        }
        .nav-links a:hover {
          color: #fff;
        }
        .btn-minimal {
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 8px 16px;
          border-radius: 8px;
          color: #fff;
          font-size: 13px;
          cursor: pointer;
        }
        .landing-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 80px 20px;
          text-align: center;
          position: relative;
          z-index: 5;
        }
        .hero-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 12px;
          background: rgba(99, 102, 241, 0.1);
          border: 1px solid rgba(99, 102, 241, 0.2);
          border-radius: 20px;
          color: #818cf8;
          font-size: 12px;
          font-weight: 600;
          margin-bottom: 32px;
        }
        .hero-title {
          font-size: clamp(48px, 8vw, 84px);
          font-weight: 800;
          line-height: 1;
          letter-spacing: -3px;
          margin-bottom: 24px;
        }
        .text-gradient {
          background: linear-gradient(to right, #fff, #6366f1);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .hero-subtitle {
          font-size: 18px;
          color: rgba(255, 255, 255, 0.5);
          max-width: 600px;
          line-height: 1.6;
          margin-bottom: 48px;
        }
        .hero-actions {
          display: flex;
          gap: 16px;
          margin-bottom: 80px;
        }
        .btn-primary-large {
          background: #fff;
          color: #000;
          padding: 16px 32px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 16px;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: transform 0.2s, background 0.2s;
        }
        .btn-primary-large:hover {
          transform: translateY(-2px);
          background: #f1f5f9;
        }
        .btn-secondary-large {
          background: rgba(255, 255, 255, 0.05);
          color: #fff;
          padding: 16px 32px;
          border-radius: 12px;
          font-weight: 700;
          font-size: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .hero-preview {
          width: 100%;
          max-width: 1100px;
          padding: 20px;
        }
        .preview-window {
          background: #0a0a0c;
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 20px;
          padding: 8px;
          box-shadow: 0 40px 100px -20px rgba(0, 0, 0, 0.8);
          position: relative;
          aspect-ratio: 16/9;
          overflow: hidden;
        }
        .preview-window img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          border-radius: 12px;
          opacity: 0.4;
        }
        .preview-dot-grid {
           position: absolute;
           inset: 0;
           background-image: radial-gradient(circle, rgba(255,255,255,0.1) 1px, transparent 1px);
           background-size: 20px 20px;
        }
        .preview-overlay {
           position: absolute;
           inset: 0;
           background: linear-gradient(to top, #000, transparent);
        }
        .landing-footer {
          padding: 40px 80px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 13px;
          border-top: 1px solid rgba(255, 255, 255, 0.05);
        }
        .footer-links {
          display: flex;
          gap: 24px;
        }
      `}</style>
    </div>
  );
};

export default LandingPage;
