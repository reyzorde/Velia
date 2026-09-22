import { useEffect, useState } from 'react';
import veliaLogoLight from '../../assets/velia-logo.png';
import veliaLogoDark from '../../assets/velia-night-logo.png';

interface VeliaLogoProps {
  className?: string;
  markOnly?: boolean;
  animated?: boolean;
}

function getThemePreference(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';

  const rootTheme = document.documentElement.getAttribute('data-theme');
  if (rootTheme === 'dark' || rootTheme === 'light') {
    return rootTheme;
  }

  try {
    const savedTheme = localStorage.getItem('velia_theme');
    if (savedTheme === 'dark' || savedTheme === 'light') {
      return savedTheme;
    }
  } catch {
    // ignore localStorage access issues in restricted browser contexts
  }

  return 'light';
}

/**
 * Velia brand logo that automatically swaps to the dark-mode asset when the app theme is dark.
 */
export default function VeliaLogo({
  className = '',
  markOnly = false,
  animated = false,
}: VeliaLogoProps) {
  const [theme, setTheme] = useState<'light' | 'dark'>(getThemePreference);

  useEffect(() => {
    const syncTheme = () => setTheme(getThemePreference());
    syncTheme();

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'data-theme') {
          syncTheme();
          break;
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const logoSrc = theme === 'dark' ? veliaLogoDark : veliaLogoLight;

  return (
    <div
      className={`velia-logo velia-logo--img ${markOnly ? 'velia-logo--mark' : ''} ${animated ? 'velia-logo--animated' : ''} ${className}`}
      role="img"
      aria-label="Velia"
    >
      <img
        src={logoSrc}
        alt="Velia"
        className="velia-logo__img"
        draggable={false}
      />
    </div>
  );
}
