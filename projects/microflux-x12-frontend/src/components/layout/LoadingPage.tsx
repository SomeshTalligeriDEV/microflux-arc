import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const LoadingPage: React.FC = () => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + Math.random() * 15;
      });
    }, 150);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="loading-container">
      <div className="loading-content">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className="loading-logo"
        >
          ⬡
        </motion.div>
        
        <div className="loading-text-container">
          <motion.h1 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="loading-title"
          >
            MICROFLUX-X1
          </motion.h1>
          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 0.6 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="loading-subtitle"
          >
            Initialising Visual Engine...
          </motion.p>
        </div>

        <div className="loading-progress-track">
          <motion.div 
            className="loading-progress-bar"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.2 }}
          />
        </div>
        
        <div className="loading-percentage">
          {Math.min(100, Math.floor(progress))}%
        </div>
      </div>

      <style>{`
        .loading-container {
          position: fixed;
          inset: 0;
          background: #000;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          color: #fff;
          font-family: 'Inter', system-ui, sans-serif;
        }
        .loading-content {
          text-align: center;
          width: 300px;
        }
        .loading-logo {
          font-size: 64px;
          margin-bottom: 24px;
          color: #fff;
          font-weight: 200;
          letter-spacing: -2px;
        }
        .loading-title {
          font-size: 24px;
          font-weight: 800;
          letter-spacing: 4px;
          margin-bottom: 8px;
          text-transform: uppercase;
        }
        .loading-subtitle {
          font-size: 13px;
          font-weight: 400;
          letter-spacing: 1px;
          margin-bottom: 40px;
          color: rgba(255, 255, 255, 0.6);
        }
        .loading-progress-track {
          width: 100%;
          height: 1px;
          background: rgba(255, 255, 255, 0.1);
          margin-bottom: 12px;
          overflow: hidden;
        }
        .loading-progress-bar {
          height: 100%;
          background: #fff;
        }
        .loading-percentage {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 2px;
          color: rgba(255, 255, 255, 0.4);
        }
      `}</style>
    </div>
  );
};

export default LoadingPage;
