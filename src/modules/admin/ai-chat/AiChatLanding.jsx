import RobotIcon from './RobotIcon.jsx';

const QUICK_PROMPTS = [
  {
    icon: 'ti-chart-bar',
    title: 'Análise de Reincidência',
    desc: 'Veja quais motoristas apresentam maior criticidade de fadiga no histórico.',
    prompt: 'Quais são os 5 motoristas com mais alertas de fadiga nas últimas semanas? Gere uma análise rápida.'
  },
  {
    icon: 'ti-report-analytics',
    title: 'Relatório de Transportadora',
    desc: 'Gere um resumo executivo em linguagem natural para reuniões operacionais.',
    prompt: 'Pode gerar um relatório executivo de fadiga para o último mês? Escolha uma das transportadoras ativas.'
  },
  {
    icon: 'ti-shield-check',
    title: 'Regras de Monitoramento',
    desc: 'Consulte criticidades e parâmetros técnicos dos alertas de telemetria.',
    prompt: 'Quais são as principais regras e criticidades configuradas no monitoramento da Sascar e Maxtrack?'
  },
  {
    icon: 'ti-settings',
    title: 'Configurações do Sistema',
    desc: 'Saiba como acessar chaves de API ou ferramentas de manutenção do admin.',
    prompt: 'Onde posso configurar as chaves da API de IA ou realizar a limpeza de histórico no sistema?'
  }
];

export default function AiChatLanding({ welcomeText, onSend }) {
  return (
    <div className="ai-landing">
      <div className="ai-landing-logo">
        <RobotIcon size={32} />
      </div>
      <h2 className="ai-landing-title">Como posso ajudar hoje?</h2>
      <p className="ai-landing-subtitle">{welcomeText}</p>

      <div className="ai-prompts-grid">
        {QUICK_PROMPTS.map((qp, i) => (
          <div
            key={i}
            className="ai-prompt-card"
            onClick={() => onSend(null, qp.prompt)}
          >
            <i className={`ti ${qp.icon}`} />
            <h5>{qp.title}</h5>
            <p>{qp.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
