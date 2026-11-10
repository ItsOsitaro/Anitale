import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/theme-context.jsx';
import { useSiteLang } from '@/i18n';
import './day-night-toggle.css';

// Day / Night toggle by Hamzeh (https://github.com/HamzehGhoreyshi/interactive-day-night-toggle), MIT license.
// The markup, CSS and motion are the repository's, unchanged. Only the wiring is ours:
//  - the click flips the site theme (useTheme), which sets the body classes is-night / is-day the CSS listens to;
//  - the knob's squash-and-stretch is the same Web Animations call as the repository's script.js;
//  - the preload class keeps the first paint from animating (same idea as the repository's script);
//  - labels come from the site's translations. The repository also swaps the browser-tab icon and shows a GitHub
//    star count; neither is part of the button, so they are not used here.
export default function DayNightToggle({ variant = 'header' }) {
  const { isDark, toggle } = useTheme();
  const { t } = useSiteLang();
  const knob = useRef(null);
  const [preload, setPreload] = useState(true);
  useEffect(() => {
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => setPreload(false)); });
    return () => cancelAnimationFrame(frame);
  }, []);

  const onClick = () => {
    toggle();
    // Squash-and-stretch on the knob while it travels (separate from the slide transform)
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      knob.current?.animate(
        [
          { transform: 'scale(1, 1)' },
          { transform: 'scale(1.14, .88)', offset: 0.25 },
          { transform: 'scale(.94, 1.06)', offset: 0.55 },
          { transform: 'scale(1.02, .98)', offset: 0.75 },
          { transform: 'scale(1, 1)' },
        ],
        { duration: 800, easing: 'ease-out' },
      );
    }
  };

  return (
    <span className={`dnt dnt--${variant}${preload ? ' preload' : ''}`}>
      <button className="toggle" type="button" role="switch" aria-checked={isDark} aria-label={isDark ? t('themeOn') : t('themeOff')} onClick={onClick}>
        <span className="pill">
          <span className="layer sky-night"></span>
      
          <svg className="layer stars" viewBox="0 0 530 243" aria-hidden="true">
            <g transform="translate(70 70) scale(7)"><g className="star" style={{ '--i': 0, '--t': '3.2s' }}><path d="M0 -1 Q0.12 -0.12 1 0 Q0.12 0.12 0 1 Q-0.12 0.12 -1 0 Q-0.12 -0.12 0 -1Z"/></g></g>
            <g transform="translate(160 92) scale(5)"><g className="star" style={{ '--i': 1, '--t': '2.6s' }}><path d="M0 -1 Q0.12 -0.12 1 0 Q0.12 0.12 0 1 Q-0.12 0.12 -1 0 Q-0.12 -0.12 0 -1Z"/></g></g>
            <g transform="translate(232 72) scale(6)"><g className="star" style={{ '--i': 2, '--t': '3.8s' }}><path d="M0 -1 Q0.12 -0.12 1 0 Q0.12 0.12 0 1 Q-0.12 0.12 -1 0 Q-0.12 -0.12 0 -1Z"/></g></g>
            <g transform="translate(250 160) scale(8)"><g className="star" style={{ '--i': 3, '--t': '3.1s' }}><path d="M0 -1 Q0.12 -0.12 1 0 Q0.12 0.12 0 1 Q-0.12 0.12 -1 0 Q-0.12 -0.12 0 -1Z"/></g></g>
            <g transform="translate(120 175) scale(5)"><g className="star" style={{ '--i': 4, '--t': '2.9s' }}><path d="M0 -1 Q0.12 -0.12 1 0 Q0.12 0.12 0 1 Q-0.12 0.12 -1 0 Q-0.12 -0.12 0 -1Z"/></g></g>
            <g transform="translate(48 130)"><g className="star" style={{ '--i': 5, '--t': '2.2s' }}><circle r="2.4"/></g></g>
            <g transform="translate(110 40)"><g className="star" style={{ '--i': 6, '--t': '2.7s' }}><circle r="1.8"/></g></g>
            <g transform="translate(200 130)"><g className="star" style={{ '--i': 7, '--t': '3.4s' }}><circle r="2.2"/></g></g>
            <g transform="translate(296 108)"><g className="star" style={{ '--i': 8, '--t': '2.4s' }}><circle r="1.6"/></g></g>
            <g transform="translate(180 205)"><g className="star" style={{ '--i': 9, '--t': '3s' }}><circle r="1.8"/></g></g>
            <g transform="translate(82 205)"><g className="star" style={{ '--i': 10, '--t': '2.5s' }}><circle r="1.6"/></g></g>
            <g transform="translate(288 45)"><g className="star" style={{ '--i': 11, '--t': '3.6s' }}><circle r="1.4"/></g></g>
          </svg>
      
          <span className="shooting"></span>
      
          <span className="knob-track">
            <span className="halo"></span>
            <span className="knob" ref={knob}>
              <span className="sun"></span>
              <span className="moon">
                <span className="crater c1"></span>
                <span className="crater c2"></span>
                <span className="crater c3"></span>
              </span>
            </span>
          </span>
      
          <svg className="cloud cloud-1" viewBox="0 0 530 243" aria-hidden="true">
            <g fill="var(--cloud-1)">
              <circle cx="230" cy="232" r="42"/>
              <circle cx="310" cy="205" r="48"/>
              <circle cx="388" cy="172" r="54"/>
              <circle cx="462" cy="110" r="70"/>
              <circle cx="528" cy="48"  r="72"/>
              <circle cx="480" cy="262" r="100"/>
              <circle cx="540" cy="150" r="60"/>
            </g>
          </svg>
          <svg className="cloud cloud-2" viewBox="0 0 530 243" aria-hidden="true">
            <g fill="var(--cloud-2)">
              <circle cx="180" cy="248" r="40"/>
              <circle cx="262" cy="228" r="44"/>
              <circle cx="345" cy="212" r="46"/>
              <circle cx="428" cy="180" r="54"/>
              <circle cx="505" cy="118" r="66"/>
              <circle cx="548" cy="62"  r="58"/>
              <circle cx="500" cy="252" r="90"/>
            </g>
          </svg>
          <svg className="cloud cloud-3" viewBox="0 0 530 243" aria-hidden="true">
            <g fill="var(--cloud-3)">
              <circle cx="118" cy="268" r="42"/>
              <circle cx="200" cy="254" r="42"/>
              <circle cx="285" cy="246" r="44"/>
              <circle cx="370" cy="238" r="46"/>
              <circle cx="452" cy="208" r="52"/>
              <circle cx="530" cy="150" r="66"/>
              <circle cx="510" cy="262" r="85"/>
            </g>
          </svg>
        </span>
      
        <span className="sr-only">{t('themeToggleHint')}</span>
      </button>
    </span>
  );
}
