import { useEffect, useState } from 'react';

// Revela o texto já recebido progressivamente (efeito "digitando"), já que o
// backend do MedBot (webhook n8n) responde em bloco único, não em stream real.
// Renderiza texto puro durante a animação e troca para HTML (markdown) só ao final,
// evitando cortar tags no meio.
export default function StreamedText({ text, active, onTick, renderHtml }) {
  const reduceMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const shouldAnimate = active && !reduceMotion;
  const [shown, setShown] = useState(shouldAnimate ? '' : text);
  const [done, setDone] = useState(!shouldAnimate);

  useEffect(() => {
    if (!shouldAnimate) return;
    const step = Math.max(1, Math.ceil(text.length / 40));
    let i = 0;
    const id = setInterval(() => {
      i += step;
      if (i >= text.length) {
        setShown(text);
        setDone(true);
        clearInterval(id);
        return;
      }
      setShown(text.slice(0, i));
      onTick?.();
    }, 20);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (done) {
    return renderHtml
      ? <div dangerouslySetInnerHTML={{ __html: renderHtml(text) }} />
      : <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{text}</p>;
  }
  return <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{shown}<span className="ai-stream-caret">▍</span></p>;
}
