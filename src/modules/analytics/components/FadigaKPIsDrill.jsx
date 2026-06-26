import { useState, useEffect } from 'react';
import { apiFetch, buildAnalyticsQuery } from '../../../lib/analyticsApi.js';

const SLA_TRATATIVA_MIN = 5;
const SLA_FINALIZACAO_MIN = 15;

const sumSeries = (series) => (series || []).reduce((a, b) => a + b, 0);

const getTopCategories = (categorias, limit = 4) => {
  if (!categorias) return [];
  return Object.entries(categorias)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
};

export default function FadigaKPIsDrill({
  activeKpi,
  d,
  prevD,
  selectedMonth,
  startDate,
  endDate,
  selectedCompany,
  selectedSeverity,
  selectedType,
  selectedUf,
  activeId,
  compare,
  comparePlatformIds,
  compareCompanies,
}) {
  const [drillData, setDrillData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeKpi) {
      setDrillData(null);
      setLoading(false);
      return;
    }

    if (
      activeKpi === 'total' ||
      activeKpi === 'velocidade' ||
      activeKpi === 'evidencia' ||
      activeKpi === 'tempo_tratar' ||
      activeKpi === 'tempo_finalizar'
    ) {
      setDrillData(d);
      setLoading(false);
      return;
    }

    // Classificações que requerem busca em segundo plano
    const classificationMap = {
      positivo: 'Positivo',
      falso: 'Falso positivo',
      naoclass: 'Não classificado',
    };

    const targetClassification = classificationMap[activeKpi];
    if (!targetClassification) return;

    setLoading(true);
    let active = true;

    const targetPlatformId = activeId ? activeId.replace('src-', '') : null;
    // `sources` alinhado ao loader principal (builder unificado) — substitui o
    // antigo `company_<pid>`. A classificação é sobrescrita pela métrica-alvo.
    const compareSources = compare
      ? (comparePlatformIds || []).map((pid) => ({ platformId: pid, company: compareCompanies[pid] || '' }))
      : [];
    const qs = buildAnalyticsQuery({
      compare,
      sources: compareSources,
      platformId: targetPlatformId,
      company: selectedCompany,
      month: selectedMonth,
      startDate,
      endDate,
      severity: selectedSeverity,
      classification: targetClassification,
      eventType: selectedType,
      uf: selectedUf,
    });

    apiFetch(`/api/analytics?${qs}`)
      .then((res) => {
        if (!res.ok) throw new Error('Falha na resposta do servidor');
        return res.json();
      })
      .then((data) => {
        if (active) {
          setDrillData(data.d);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('[MedNet Drill] Erro ao carregar detalhamento:', err);
        if (active) {
          setDrillData(null);
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    activeKpi,
    activeId,
    compare,
    comparePlatformIds,
    selectedMonth,
    startDate,
    endDate,
    selectedCompany,
    compareCompanies,
    selectedSeverity,
    selectedType,
    selectedUf,
    d,
  ]);

  if (!activeKpi) return null;

  const borderColors = {
    total: '#9E1A45',
    positivo: '#E24B4A',
    falso: '#E8A020',
    naoclass: 'var(--text-secondary, #8A94A6)',
    velocidade: '#2A8DD9',
    evidencia: '#2DA75A',
    tempo_tratar: '#9E1A45',
    tempo_finalizar: '#2DA75A',
  };
  const accentColor = borderColors[activeKpi] || '#ccc';

  if (loading) {
    return (
      <div className="card" style={{ marginBottom: 16, borderTop: `3px solid ${accentColor}` }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100px', width: '100%' }}>
          <i className="ti ti-loader-2 fz-spin" style={{ fontSize: '24px', color: accentColor }}></i>
          <span style={{ marginLeft: '10px', fontSize: '13px', fontWeight: 500, color: 'var(--text-secondary)' }}>
            Carregando detalhamento...
          </span>
        </div>
      </div>
    );
  }

  if (!drillData) return null;

  const renderColumns = () => {
    switch (activeKpi) {
      case 'total': {
        const totalPos = drillData.clf_total?.['Positivo'] || 0;
        const totalFalso = drillData.clf_total?.['Falso positivo'] || 0;
        const totalNaoclass = drillData.clf_total?.['Não classificado'] || 0;
        const gravissimo = sumSeries(drillData.mensal_crit?.series?.['Gravíssimo']);
        const grave = sumSeries(drillData.mensal_crit?.series?.['Grave']);
        const medio = sumSeries(drillData.mensal_crit?.series?.['Médio']);

        return (
          <>
            <div className="dg-drill-col">
              <h4>Por Classificação</h4>
              <div className="dg-drill-line">
                <span>Positivos</span>
                <span className="v" style={{ color: '#E24B4A' }}>{totalPos.toLocaleString('pt-BR')}</span>
              </div>
              <div className="dg-drill-line">
                <span>Falsos Positivos</span>
                <span className="v" style={{ color: '#E8A020' }}>{totalFalso.toLocaleString('pt-BR')}</span>
              </div>
              <div className="dg-drill-line">
                <span>Sem Classificação</span>
                <span className="v" style={{ color: 'var(--text-secondary)' }}>{totalNaoclass.toLocaleString('pt-BR')}</span>
              </div>
            </div>
            <div className="dg-drill-col">
              <h4>Por Criticidade</h4>
              <div className="dg-drill-line">
                <span>Gravíssimo</span>
                <span className="v" style={{ color: 'var(--danger-500, #E24B4A)' }}>{gravissimo.toLocaleString('pt-BR')}</span>
              </div>
              <div className="dg-drill-line">
                <span>Grave</span>
                <span className="v" style={{ color: 'var(--warning-500, #E8A020)' }}>{grave.toLocaleString('pt-BR')}</span>
              </div>
              <div className="dg-drill-line">
                <span>Médio</span>
                <span className="v" style={{ color: 'var(--brand-500, #3F76C2)' }}>{medio.toLocaleString('pt-BR')}</span>
              </div>
            </div>
            <div className="dg-drill-col">
              <h4>Top Transportadoras</h4>
              {(drillData.frota?.labels || []).slice(0, 4).map((label, i) => (
                <div key={i} className="dg-drill-line">
                  <span>{label}</span>
                  <span className="v">{drillData.frota.valores[i].toLocaleString('pt-BR')}</span>
                </div>
              ))}
              {(!drillData.frota?.labels || drillData.frota.labels.length === 0) && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 6 }}>Nenhuma transportadora</div>
              )}
            </div>
          </>
        );
      }

      case 'positivo':
      case 'falso': {
        const kpiGravissimo = sumSeries(drillData.mensal_crit?.series?.['Gravíssimo']);
        const kpiGrave = sumSeries(drillData.mensal_crit?.series?.['Grave']);
        const kpiMedio = sumSeries(drillData.mensal_crit?.series?.['Médio']);
        const topGatilhos = getTopCategories(drillData.categorias, 4);

        return (
          <>
            <div className="dg-drill-col">
              <h4>Por Criticidade</h4>
              <div className="dg-drill-line">
                <span>Gravíssimo</span>
                <span className="v" style={{ color: 'var(--danger-500, #E24B4A)' }}>{kpiGravissimo.toLocaleString('pt-BR')}</span>
              </div>
              <div className="dg-drill-line">
                <span>Grave</span>
                <span className="v" style={{ color: 'var(--warning-500, #E8A020)' }}>{kpiGrave.toLocaleString('pt-BR')}</span>
              </div>
              <div className="dg-drill-line">
                <span>Médio</span>
                <span className="v" style={{ color: 'var(--brand-500, #3F76C2)' }}>{kpiMedio.toLocaleString('pt-BR')}</span>
              </div>
            </div>
            <div className="dg-drill-col">
              <h4>Principais Gatilhos</h4>
              {topGatilhos.map((g, i) => (
                <div key={i} className="dg-drill-line">
                  <span>{g.name}</span>
                  <span className="v">{g.count.toLocaleString('pt-BR')}</span>
                </div>
              ))}
              {topGatilhos.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 6 }}>Nenhum gatilho</div>
              )}
            </div>
            <div className="dg-drill-col">
              <h4>Top Transportadoras</h4>
              {(drillData.frota?.labels || []).slice(0, 4).map((label, i) => (
                <div key={i} className="dg-drill-line">
                  <span>{label}</span>
                  <span className="v">{drillData.frota.valores[i].toLocaleString('pt-BR')}</span>
                </div>
              ))}
              {(!drillData.frota?.labels || drillData.frota.labels.length === 0) && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 6 }}>Nenhuma transportadora</div>
              )}
            </div>
          </>
        );
      }

      case 'naoclass': {
        const kpiGravissimo = sumSeries(drillData.mensal_crit?.series?.['Gravíssimo']);
        const kpiGrave = sumSeries(drillData.mensal_crit?.series?.['Grave']);
        const kpiMedio = sumSeries(drillData.mensal_crit?.series?.['Médio']);

        return (
          <>
            <div className="dg-drill-col">
              <h4>Por Criticidade</h4>
              <div className="dg-drill-line">
                <span>Gravíssimo</span>
                <span className="v" style={{ color: 'var(--danger-500, #E24B4A)' }}>{kpiGravissimo.toLocaleString('pt-BR')}</span>
              </div>
              <div className="dg-drill-line">
                <span>Grave</span>
                <span className="v" style={{ color: 'var(--warning-500, #E8A020)' }}>{kpiGrave.toLocaleString('pt-BR')}</span>
              </div>
              <div className="dg-drill-line">
                <span>Médio</span>
                <span className="v" style={{ color: 'var(--brand-500, #3F76C2)' }}>{kpiMedio.toLocaleString('pt-BR')}</span>
              </div>
            </div>
            <div className="dg-drill-col">
              <h4>Fatores da Categoria</h4>
              <div className="dg-drill-line">
                <span>Auto Finalizado</span>
                <span className="v">{drillData.naoclass_reasons?.autoFinalizado?.toLocaleString('pt-BR') || 0}</span>
              </div>
              <div className="dg-drill-line">
                <span>Imagem não visível</span>
                <span className="v">{drillData.naoclass_reasons?.imagemNaoVisivel?.toLocaleString('pt-BR') || 0}</span>
              </div>
              <div className="dg-drill-line">
                <span>Outros</span>
                <span className="v">{drillData.naoclass_reasons?.outros?.toLocaleString('pt-BR') || 0}</span>
              </div>
            </div>
            <div className="dg-drill-col">
              <h4>Top Transportadoras</h4>
              {(drillData.frota?.labels || []).slice(0, 4).map((label, i) => (
                <div key={i} className="dg-drill-line">
                  <span>{label}</span>
                  <span className="v">{drillData.frota.valores[i].toLocaleString('pt-BR')}</span>
                </div>
              ))}
              {(!drillData.frota?.labels || drillData.frota.labels.length === 0) && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 6 }}>Nenhuma transportadora</div>
              )}
            </div>
          </>
        );
      }

      case 'velocidade': {
        const velLabels = drillData.vel?.labels || [];
        const velValores = drillData.vel?.valores || [];

        return (
          <>
            <div className="dg-drill-col">
              <h4>Distribuição (km/h)</h4>
              {velLabels.map((lbl, i) => (
                <div key={i} className="dg-drill-line">
                  <span>{lbl} km/h</span>
                  <span className="v">{velValores[i]?.toLocaleString('pt-BR') || 0}</span>
                </div>
              ))}
            </div>
            <div className="dg-drill-col">
              <h4>Métricas Gerais</h4>
              <div className="dg-drill-line">
                <span>Velocidade Mediana</span>
                <span className="v">{drillData.kpis?.vel_mediana ? `${drillData.kpis.vel_mediana} km/h` : '—'}</span>
              </div>
              <div className="dg-drill-line">
                <span>Velocidade Média</span>
                <span className="v">{drillData.kpis?.vel_media ? `${drillData.kpis.vel_media} km/h` : '—'}</span>
              </div>
              <div className="dg-drill-line">
                <span>Excesso (&gt;60 km/h)</span>
                <span className="v" style={{ color: '#E24B4A' }}>{drillData.kpis?.pct_vel_alta != null ? `${drillData.kpis.pct_vel_alta}%` : '—'}</span>
              </div>
            </div>
            <div className="dg-drill-col">
              <h4>Top Veículos</h4>
              {(drillData.top_placas?.labels || []).slice(0, 4).map((label, i) => (
                <div key={i} className="dg-drill-line">
                  <span>{label}</span>
                  <span className="v">{drillData.top_placas.valores[i]?.toLocaleString('pt-BR') || 0}</span>
                </div>
              ))}
              {(!drillData.top_placas?.labels || drillData.top_placas.labels.length === 0) && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 6 }}>Nenhum veículo</div>
              )}
            </div>
          </>
        );
      }

      case 'evidencia': {
        const evidDisp = drillData.evidencia?.disp || 0;
        const evidAguard = drillData.evidencia?.aguard || 0;
        const topGatilhosEvid = getTopCategories(drillData.categorias, 4);

        return (
          <>
            <div className="dg-drill-col">
              <h4>Status de Mídia</h4>
              <div className="dg-drill-line">
                <span>Vídeo Disponível</span>
                <span className="v" style={{ color: '#2DA75A' }}>{evidDisp.toLocaleString('pt-BR')}</span>
              </div>
              <div className="dg-drill-line">
                <span>Vídeo Aguardando</span>
                <span className="v" style={{ color: 'var(--text-muted)' }}>{evidAguard.toLocaleString('pt-BR')}</span>
              </div>
              <div className="dg-drill-line">
                <span>Taxa de Disponibilidade</span>
                <span className="v">{drillData.kpis?.pct_evidencia != null ? `${drillData.kpis.pct_evidencia}%` : '—'}</span>
              </div>
            </div>
            <div className="dg-drill-col">
              <h4>Principais Gatilhos</h4>
              {topGatilhosEvid.map((g, i) => (
                <div key={i} className="dg-drill-line">
                  <span>{g.name}</span>
                  <span className="v">{g.count.toLocaleString('pt-BR')}</span>
                </div>
              ))}
              {topGatilhosEvid.length === 0 && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 6 }}>Nenhum gatilho</div>
              )}
            </div>
            <div className="dg-drill-col">
              <h4>Top Transportadoras</h4>
              {(drillData.frota?.labels || []).slice(0, 4).map((label, i) => (
                <div key={i} className="dg-drill-line">
                  <span>{label}</span>
                  <span className="v">{drillData.frota.valores[i].toLocaleString('pt-BR')}</span>
                </div>
              ))}
              {(!drillData.frota?.labels || drillData.frota.labels.length === 0) && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 6 }}>Nenhuma transportadora</div>
              )}
            </div>
          </>
        );
      }

      case 'tempo_tratar': {
        const tIni = drillData.kpis?.t_ini_mediana;
        const tPrev = prevD?.kpis?.t_ini_mediana;

        return (
          <>
            <div className="dg-drill-col">
              <h4>Resumo da Operação</h4>
              <div className="dg-drill-line">
                <span>Mediana do Período</span>
                <span className="v">{tIni != null ? `${tIni} min` : '—'}</span>
              </div>
              <div className="dg-drill-line">
                <span>Período Anterior</span>
                <span className="v">{tPrev != null ? `${tPrev} min` : '—'}</span>
              </div>
            </div>
            <div className="dg-drill-col">
              <h4>Metas Operacionais</h4>
              <div className="dg-drill-line">
                <span>Meta de Atendimento</span>
                <span className="v">&lt; {SLA_TRATATIVA_MIN}.0 min</span>
              </div>
              <div className="dg-drill-line">
                <span>Desempenho</span>
                <span className="v" style={{ color: tIni != null && tIni <= SLA_TRATATIVA_MIN ? 'var(--success-500, #2DA75A)' : 'var(--danger-500, #E24B4A)' }}>
                  {tIni == null ? 'Sem dados' : tIni <= SLA_TRATATIVA_MIN ? 'Dentro do SLA' : 'Fora do SLA'}
                </span>
              </div>
            </div>
            <div className="dg-drill-col">
              <h4>Sobre a Métrica</h4>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0, paddingRight: 8 }}>
                Mede o tempo mediano decorrido entre a emissão do alerta pelo sistema embarcado e o registro do início da tratativa pela central de monitoramento.
              </p>
            </div>
          </>
        );
      }

      case 'tempo_finalizar': {
        const tFin = drillData.kpis?.t_fin_mediana;
        const tFinPrev = prevD?.kpis?.t_fin_mediana;

        return (
          <>
            <div className="dg-drill-col">
              <h4>Resumo da Operação</h4>
              <div className="dg-drill-line">
                <span>Mediana do Período</span>
                <span className="v">{tFin != null ? `${tFin} min` : '—'}</span>
              </div>
              <div className="dg-drill-line">
                <span>Período Anterior</span>
                <span className="v">{tFinPrev != null ? `${tFinPrev} min` : '—'}</span>
              </div>
            </div>
            <div className="dg-drill-col">
              <h4>Metas Operacionais</h4>
              <div className="dg-drill-line">
                <span>Meta de Conclusão</span>
                <span className="v">&lt; {SLA_FINALIZACAO_MIN}.0 min</span>
              </div>
              <div className="dg-drill-line">
                <span>Desempenho</span>
                <span className="v" style={{ color: tFin != null && tFin <= SLA_FINALIZACAO_MIN ? 'var(--success-500, #2DA75A)' : 'var(--danger-500, #E24B4A)' }}>
                  {tFin == null ? 'Sem dados' : tFin <= SLA_FINALIZACAO_MIN ? 'Dentro do SLA' : 'Fora do SLA'}
                </span>
              </div>
            </div>
            <div className="dg-drill-col">
              <h4>Sobre a Métrica</h4>
              <p style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5, margin: 0, paddingRight: 8 }}>
                Mede o tempo mediano decorrido entre a emissão do alerta e o encerramento completo de todas as etapas de tratativa/auditoria do caso.
              </p>
            </div>
          </>
        );
      }
      default:
        return null;
    }
  };

  const renderNote = () => {
    if (activeKpi === 'naoclass') {
      return (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.5, display: 'flex', alignItems: 'flex-start', gap: '8px', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
            <i className="ti ti-info-circle" style={{ fontSize: '14px', color: accentColor, marginTop: '2px' }}></i>
            <span>
              <strong>Por que "Sem Classificação"?</strong> Estes alertas não possuem auditoria manual e ficam nesta classificação no relatório devido a dois fatores da plataforma de origem:
            </span>
          </div>
          <ul style={{ margin: '0 0 0 24px', padding: 0, listStyleType: 'disc', display: 'flex', flexDirection: 'column', gap: '4px' }}>
            <li>Alertas com status <strong>"Auto Finalizado..."</strong> na coluna <em>Status</em>.</li>
            <li>Alertas com status <strong>"Finalizado"</strong> na coluna <em>Status</em>, mas com <strong>"Imagem não visível"</strong> na coluna <em>Tipo de Classificação</em>.</li>
          </ul>
        </div>
      );
    }
    if (activeKpi === 'positivo') {
      return (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.4, display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
          <i className="ti ti-info-circle" style={{ fontSize: '14px', color: accentColor, marginTop: '2px' }}></i>
          <span>
            <strong>O que são "Alertas Positivos"?</strong> Alertas gerados que foram avaliados pela equipe e confirmados como eventos reais de fadiga ou desatenção do motorista.
          </span>
        </div>
      );
    }
    if (activeKpi === 'falso') {
      return (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: '11.5px', color: 'var(--text-muted)', lineHeight: 1.4, display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
          <i className="ti ti-info-circle" style={{ fontSize: '14px', color: accentColor, marginTop: '2px' }}></i>
          <span>
            <strong>O que são "Falsos Positivos"?</strong> Alertas que foram avaliados pela operação e descartados como alarmes falsos gerados pelo sensor (por ex., uso de óculos escuros, bocejos normais ou reflexos de luz).
          </span>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="card" style={{ marginBottom: 16, borderTop: `3px solid ${accentColor}` }}>
      <div style={{ background: 'transparent', borderTop: 'none', padding: '14px 18px' }}>
        <div className="dg-drill" style={{ padding: 0, border: 'none', background: 'transparent' }}>
          {renderColumns()}
        </div>
        {renderNote()}
      </div>
    </div>
  );
}
