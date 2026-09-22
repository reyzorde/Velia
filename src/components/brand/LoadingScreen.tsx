import { useEffect, useState, useRef } from 'react';
import VeliaLogo from './VeliaLogo';

interface LoadingScreenProps {
  onComplete?: () => void;
  /** Minimum visible time (ms). Default 1800 */
  minDuration?: number;
  /** Wait until ready=true before finishing */
  waitForReady?: boolean;
  ready?: boolean;
}

/**
 * Premium Velia opening screen.
 * Logo reveal (~1.8s) then smooth fade-out into the app.
 */
export default function LoadingScreen({
  onComplete,
  minDuration = 1800,
  waitForReady = false,
  ready = true,
}: LoadingScreenProps) {
  const [exiting, setExiting] = useState(false);
  const [minElapsed, setMinElapsed] = useState(false);
  const finished = useRef(false);

  // Mark minimum duration elapsed
  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? 150 : minDuration;
    const t = setTimeout(() => setMinElapsed(true), duration);
    return () => clearTimeout(t);
  }, [minDuration]);

  // Finish when min time done AND (not waiting OR ready)
  useEffect(() => {
    if (finished.current) return;
    if (!minElapsed) return;
    if (waitForReady && !ready) return;

    finished.current = true;
    setExiting(true);
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => onComplete?.(), reduced ? 60 : 300);
    return () => clearTimeout(t);
  }, [minElapsed, waitForReady, ready, onComplete]);

  // Safety: never stuck longer than 6s
  useEffect(() => {
    const t = setTimeout(() => {
      if (!finished.current) {
        finished.current = true;
        setExiting(true);
        setTimeout(() => onComplete?.(), 200);
      }
    }, 6000);
    return () => clearTimeout(t);
  }, [onComplete]);

  return (
    <div
      className={`velia-loader ${exiting ? 'velia-loader--exit' : ''}`}
      role="status"
      aria-live="polite"
      aria-label="Velia yuklanmoqda"
    >
      <div className="velia-loader__stage">
        <VeliaLogo animated className="velia-loader__logo" />
        <div className="velia-loader__bar" aria-hidden="true">
          <div className="velia-loader__bar-fill" />
        </div>
      </div>
    </div>
  );
}
