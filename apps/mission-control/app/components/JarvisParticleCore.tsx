'use client';

import { useEffect, useRef } from 'react';

type Particle = {
  angle: number;
  distance: number;
  targetDistance: number;
  speed: number;
  size: number;
  phase: number;
  hue: 'cyan' | 'red' | 'white';
};

const PARTICLE_COUNT = 2400;

function makeParticle(index: number): Particle {
  const ring = index % 7;
  const targetDistance = ring < 3 ? 0.22 + ring * 0.085 : 0.52 + (ring - 3) * 0.07;

  return {
    angle: (index * 137.508) * Math.PI / 180,
    distance: 1.2 + ((index * 29) % 80) / 100,
    targetDistance,
    speed: 0.00055 + ((index * 13) % 31) / 100000,
    size: ring === 0 ? 1.35 : ring === 6 ? 0.8 : 1,
    phase: (index * 0.37) % (Math.PI * 2),
    hue: index % 17 === 0 ? 'red' : index % 11 === 0 ? 'white' : 'cyan',
  };
}

export function JarvisParticleCore() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext('2d');
    if (!context) return undefined;
    const surface = canvas;
    const ctx = context;

    const particles = Array.from({ length: PARTICLE_COUNT }, (_, index) => makeParticle(index));
    let animationFrame = 0;
    let start = performance.now();

    function resize() {
      const parent = surface.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      surface.width = Math.max(1, Math.floor(rect.width * ratio));
      surface.height = Math.max(1, Math.floor(rect.height * ratio));
      surface.style.width = `${rect.width}px`;
      surface.style.height = `${rect.height}px`;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function draw(now: number) {
      const elapsed = now - start;
      const width = surface.clientWidth;
      const height = surface.clientHeight;
      const cx = width / 2;
      const cy = height / 2;
      const radius = Math.min(width, height) * 0.47;
      const assemble = Math.min(1, elapsed / 3600);
      const breathe = Math.sin(elapsed / 680) * 0.018;

      ctx.clearRect(0, 0, width, height);
      ctx.globalCompositeOperation = 'lighter';

      const arcRadius = radius * (0.98 + breathe);
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 5; i += 1) {
        const sweep = Math.PI * (0.28 + i * 0.075);
        const spin = elapsed / (1900 + i * 430) + i * 1.42;
        ctx.beginPath();
        ctx.strokeStyle = i % 2 === 0 ? 'rgba(87, 225, 255, 0.5)' : 'rgba(255, 65, 105, 0.42)';
        ctx.arc(cx, cy, arcRadius + i * 11, spin, spin + sweep);
        ctx.stroke();
      }

      for (const particle of particles) {
        particle.angle += particle.speed * (1 + Math.sin(elapsed / 1400 + particle.phase) * 0.45);
        particle.distance += (particle.targetDistance - particle.distance) * 0.018 * assemble;

        const swirl = Math.sin(elapsed / 900 + particle.phase) * radius * 0.025;
        const wave = Math.cos(elapsed / 1100 + particle.phase * 1.7) * radius * 0.015;
        const d = radius * (particle.distance + breathe);
        const x = cx + Math.cos(particle.angle) * (d + swirl);
        const y = cy + Math.sin(particle.angle) * (d * 0.72 + wave);
        const alpha = 0.18 + assemble * 0.72 + Math.sin(elapsed / 420 + particle.phase) * 0.08;

        if (particle.hue === 'red') {
          ctx.fillStyle = `rgba(255, 64, 103, ${Math.max(0.12, alpha * 0.72)})`;
        } else if (particle.hue === 'white') {
          ctx.fillStyle = `rgba(235, 255, 255, ${Math.max(0.16, alpha)})`;
        } else {
          ctx.fillStyle = `rgba(90, 232, 255, ${Math.max(0.12, alpha)})`;
        }

        ctx.beginPath();
        ctx.arc(x, y, particle.size, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.fillStyle = 'rgba(236, 255, 255, 0.9)';
      ctx.arc(cx, cy, radius * 0.055, 0, Math.PI * 2);
      ctx.fill();

      animationFrame = requestAnimationFrame(draw);
    }

    resize();
    start = performance.now();
    animationFrame = requestAnimationFrame(draw);
    window.addEventListener('resize', resize);

    return () => {
      cancelAnimationFrame(animationFrame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="jarvis-particle-canvas" aria-hidden="true" />;
}
