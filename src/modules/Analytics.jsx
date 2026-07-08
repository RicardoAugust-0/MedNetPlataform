import '../styles/analytics.css';
import Skeleton from '../components/Skeleton.jsx';

// Subcomponents
import FadigaKPIs from './analytics/FadigaKPIs.jsx';
import ComparisonView from './analytics/ComparisonView.jsx';
import FadigaCharts from './analytics/FadigaCharts.jsx';
import ImportModal from './analytics/ImportModal.jsx';
import FadigaKPIsDrill from './analytics/components/FadigaKPIsDrill.jsx';

// Modular components
import AnalyticsHeader from './analytics/components/AnalyticsHeader.jsx';
import SourceChips from './analytics/components/SourceChips.jsx';
import ComparisonModal from './analytics/components/ComparisonModal.jsx';

// Custom Hook
import { useAnalyticsState } from './analytics/hooks/useAnalyticsState.js';
import { useFadigaScore } from './analytics/hooks/useFadigaScore.js';

export default function Analytics() {
  const state = useAnalyticsState();
  const fadigaScoreResult = useFadigaScore(state.d);
  const fadigaScore = (state.activeId || state.compare) ? fadigaScoreResult?.score ?? null : null;

  if (state.loading) {
    return (
      <div style={{ width: '100%', padding: '4px 0 24px' }} aria-busy="true">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <Skeleton width={220} height={28} radius={8} />
          <Skeleton width={160} height={28} radius={8} style={{ marginLeft: 'auto' }} />
          <Skeleton width={100} height={28} radius={8} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={90} radius={12} />
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={220} radius={14} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', padding: '4px 0 24px' }}>
      <div className="analytics-container">
        
        <AnalyticsHeader
          activeId={state.activeId}
          compare={state.compare}
          availableMonths={state.availableMonths}
          selectedMonth={state.selectedMonth}
          setSelectedMonth={state.setSelectedMonth}
          formatMonthKey={state.formatMonthKey}
          startDate={state.startDate}
          setStartDate={state.setStartDate}
          endDate={state.endDate}
          setEndDate={state.setEndDate}
          d={state.d}
          sourcesList={state.sourcesList}
          handleCompareClick={state.handleCompareClick}
          activeSource={state.activeSource}
          exportToCSV={state.exportToCSV}
          exportToHTML={state.exportToHTML}
          setModalOpen={state.setModalOpen}
          selectedCompany={state.selectedCompany}
          setSelectedCompany={setSelectedCompany => state.setSelectedCompany(setSelectedCompany)}
          availableCompanies={state.availableCompanies}
          savedViews={state.savedViews}
          promptSaveCurrentView={state.promptSaveCurrentView}
          applySavedView={state.applySavedView}
          removeSavedView={state.removeSavedView}
          fadigaScore={fadigaScore}
        />

        <SourceChips
          sourcesList={state.sourcesList}
          activeId={state.activeId}
          compare={state.compare}
          setCompare={state.setCompare}
          setActiveId={state.setActiveId}
          removeSource={state.removeSource}
        />

        {/* Hero de Sem Dados */}
        {state.sourcesList.length === 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #5A0F25, #1A0308)',
            color: '#fff',
            borderRadius: '12px',
            padding: '24px 26px',
            position: 'relative',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '20px',
            marginBottom: '22px',
            border: '1px solid rgba(158,26,69,0.3)',
            flexWrap: 'wrap',
          }}>
            <div style={{ position: 'relative', minWidth: 0 }}>
              <div style={{ fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: '#E09AB5', fontWeight: 600, marginBottom: '5px' }}>
                Importação universal
              </div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Nenhuma planilha carregada</h3>
              <p style={{ fontSize: '12.5px', color: 'rgba(255,255,255,0.72)', marginTop: '6px', maxWidth: '620px', lineHeight: 1.6, margin: '6px 0 0' }}>
                Importe um relatório de qualquer plataforma — MaxTrack, Sascar, Sascar JD, Sighra, Horizon, AutoTrac, OmniLink ou Trimble. O sistema detecta o layout, mapeia as colunas e preenche os indicadores automaticamente. Os gráficos abaixo mostram a estrutura final dos dados.
              </p>
            </div>
            <button
              onClick={() => state.setModalOpen(true)}
              className="btn btn-primary"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '7px',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                borderRadius: '8px',
                cursor: 'pointer',
                border: 'none',
                backgroundColor: '#F26931',
                color: '#fff',
                flexShrink: 0,
              }}
            >
              <i className="ti ti-upload" style={{ fontSize: '16px' }}></i> Importar planilha
            </button>
          </div>
        )}

        {/* Placeholder para Selecionar Fonte */}
        {state.sourcesList.length > 0 && !state.activeId && !state.compare && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(158, 26, 69, 0.04), rgba(15, 25, 35, 0.01))',
            borderRadius: '12px',
            padding: '46px 20px',
            textAlign: 'center',
            border: '1px dashed var(--border)',
            marginBottom: '22px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px'
          }}>
            <i className="ti ti-hand-finger" style={{ fontSize: '36px', color: '#9E1A45' }}></i>
            <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>Nenhum relatório selecionado</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)', margin: 0, maxWidth: '500px', lineHeight: '1.5' }}>
              Selecione uma das fontes de dados acima para carregar o relatório e visualizar os gráficos e indicadores de fadiga.
            </p>
          </div>
        )}

        {/* KPIs Row */}
        {(state.activeId || state.compare) && (
          <>
            <FadigaKPIs
              d={state.d}
              prevD={state.prevD}
              activeKpi={state.activeKpi}
              setActiveKpi={state.setActiveKpi}
            />
            <FadigaKPIsDrill
              activeKpi={state.activeKpi}
              d={state.d}
              prevD={state.prevD}
              selectedMonth={state.selectedMonth}
              startDate={state.startDate}
              endDate={state.endDate}
              selectedCompany={state.selectedCompany}
              selectedSeverity={state.selectedSeverity}
              selectedType={state.selectedType}
              selectedUf={state.selectedUf}
              activeId={state.activeId}
              compare={state.compare}
              comparePlatformIds={state.comparePlatformIds}
              compareCompanies={state.compareCompanies}
            />
          </>
        )}

        {/* Comparação */}
        {state.compare && state.sources.length >= 2 && (
          <ComparisonView
            sources={state.sources}
            selectedMonth={state.selectedMonth}
            formatMonthKey={state.formatMonthKey}
            compareCompanies={state.compareCompanies}
            setCompareCompanies={state.setCompareCompanies}
            selectedSeverity={state.selectedSeverity}
            compareMode={state.compareMode}
          />
        )}

        {(state.activeId || state.compare) && (
          <FadigaCharts
            d={state.d}
            noData={state.noData}
            selectedMonth={state.selectedMonth}
            setSelectedMonth={state.setSelectedMonth}
            formatMonthKey={state.formatMonthKey}
            startDate={state.startDate}
            endDate={state.endDate}
            selectedSeverity={state.selectedSeverity}
            setSelectedSeverity={state.setSelectedSeverity}
            selectedClassification={state.selectedClassification}
            setSelectedClassification={state.setSelectedClassification}
            selectedType={state.selectedType}
            setSelectedType={state.setSelectedType}
            availableTypes={state.availableTypes}
            selectedCompany={state.selectedCompany}
            setSelectedCompany={state.setSelectedCompany}
            availableCompanies={state.availableCompanies}
            selectedUf={state.selectedUf}
            setSelectedUf={state.setSelectedUf}
            availableUfs={state.availableUfs}
            compare={state.compare}
            platformId={state.activeSource?.platformId}
          />
        )}

        {/* Nota explicativa de rodapé */}
        <div style={{ marginTop: '24px', fontSize: '11.5px', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px 18px', background: 'var(--surface-0)', lineHeight: '1.7' }}>
          <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Como ler. </b>
          Os indicadores são recalculados a cada importação e filtragem. Criticidades com grafias divergentes são unificadas em Gravíssimo / Grave / Médio; a classificação é normalizada em Positivo / Falso positivo / Não classificado. Eventos de criticidade <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Leve</b> são preservados no banco, mas ficam fora da análise. A UF é extraída do texto da localidade. Use <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Comparar plataformas</b> para confrontar duas ou mais fontes e <b style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Exportar PDF</b> para gerar o relatório completo para impressão.
        </div>

      </div>

      <ImportModal
        modalOpen={state.modalOpen}
        setModalOpen={state.setModalOpen}
        saving={state.saving}
        onImportConfirm={state.onImportConfirm}
      />

      {state.compareModalOpen && (
        <ComparisonModal
          sourcesList={state.sourcesList}
          compareOptions={state.compareOptions}
          tempMode={state.tempMode}
          setTempMode={state.setTempMode}
          tempSelected={state.tempSelected}
          handleToggleTempCompare={state.handleToggleTempCompare}
          tempCompanyPlatform={state.tempCompanyPlatform}
          handleSelectTempCompanyPlatform={state.handleSelectTempCompanyPlatform}
          tempCompanyList={state.tempCompanyList}
          handleToggleTempCompany={state.handleToggleTempCompany}
          handleConfirmCompare={state.handleConfirmCompare}
          setCompareModalOpen={state.setCompareModalOpen}
        />
      )}
    </div>
  );
}
