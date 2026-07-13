import { VolumeMensalCard, VolumeCriticidadeCard } from './components/VolumeCharts.jsx';
import { ClassificacaoAlertasCard, TaxaFalsoPositivoCard, TipoDeteccaoCard } from './components/AlertsStatusCharts.jsx';
import { HoraDiaCard, DiaSemanaCard, VelocidadeAlertaCard } from './components/TemporalCharts.jsx';
import { AlertasCategoriaCard, EvidenciaVideoCard } from './components/CategoryEvidenceCharts.jsx';
import { MotoristasMaisAlertasCard, VeiculosMaisAlertasCard } from './components/DriverVehicleCharts.jsx';
import { DistribuicaoUfCard, FrotaBaseCard } from './components/DistributionCharts.jsx';
import OperatorRankingCard from './components/OperatorRankingCard.jsx';

export default function FadigaCharts({
  d,
  noData,
  selectedMonth,
  setSelectedMonth,
  formatMonthKey,
  startDate,
  endDate,
  selectedSeverity,
  setSelectedSeverity,
  selectedClassification,
  setSelectedClassification,
  selectedType,
  setSelectedType,
  availableTypes = [],
  selectedCompany,
  setSelectedCompany,
  availableCompanies = [],
  selectedUf,
  setSelectedUf,
  availableUfs = [],
  compare,
  platformId
}) {
  const headerStyle = {
    fontSize: '10px',
    letterSpacing: '1.6px',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
    fontWeight: 600,
    margin: '28px 2px 14px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  };

  const lineIndicatorStyle = {
    width: '16px',
    height: '2px',
    background: '#9E1A45',
    borderRadius: '2px',
    display: 'inline-block'
  };

  return (
    <>
      {/* Evolução */}
      <div>
        <div style={headerStyle}>
          <span style={lineIndicatorStyle}></span>
          Evolução do volume
        </div>
        <VolumeMensalCard
          d={d}
          noData={noData}
          selectedMonth={selectedMonth}
          setSelectedMonth={setSelectedMonth}
          formatMonthKey={formatMonthKey}
          startDate={startDate}
          endDate={endDate}
        />
      </div>

      {/* Severidade e Qualidade */}
      <div>
        <div style={headerStyle}>
          <span style={lineIndicatorStyle}></span>
          Severidade e qualidade dos alertas
        </div>
        <div className="grid-equal-2col">
          <VolumeCriticidadeCard
            d={d}
            noData={noData}
            selectedMonth={selectedMonth}
            startDate={startDate}
            endDate={endDate}
            selectedSeverity={selectedSeverity}
            setSelectedSeverity={setSelectedSeverity}
          />
          <ClassificacaoAlertasCard
            d={d}
            noData={noData}
            selectedClassification={selectedClassification}
            setSelectedClassification={setSelectedClassification}
          />
        </div>
        <div className="grid-equal-2col" style={{ marginTop: '14px' }}>
          <TaxaFalsoPositivoCard
            d={d}
            noData={noData}
            selectedMonth={selectedMonth}
          />
          <TipoDeteccaoCard
            d={d}
            noData={noData}
            selectedMonth={selectedMonth}
            selectedType={selectedType}
            setSelectedType={setSelectedType}
            availableTypes={availableTypes}
          />
        </div>
      </div>

      {/* Categorias de Evento Sascar */}
      <AlertasCategoriaCard
        d={d}
        noData={noData}
        selectedType={selectedType}
        setSelectedType={setSelectedType}
        availableTypes={availableTypes}
      />

      {/* Quando os alertas acontecem */}
      <div>
        <div style={headerStyle}>
          <span style={lineIndicatorStyle}></span>
          Quando os alertas acontecem
        </div>
        <div className="grid-2col">
          <HoraDiaCard
            d={d}
            noData={noData}
          />
          <DiaSemanaCard
            d={d}
            noData={noData}
          />
        </div>
        <div className="grid-equal-2col" style={{ marginTop: '14px' }}>
          <VelocidadeAlertaCard
            d={d}
            noData={noData}
          />
          <EvidenciaVideoCard
            d={d}
            noData={noData}
          />
        </div>
      </div>

      {/* Ranking de Exposição */}
      <div>
        <div style={headerStyle}>
          <span style={lineIndicatorStyle}></span>
          Ranking de exposição
        </div>
        <div className="grid-equal-2col">
          <MotoristasMaisAlertasCard
            d={d}
            noData={noData}
          />
          <VeiculosMaisAlertasCard
            d={d}
            noData={noData}
          />
        </div>
        <div className="grid-equal-2col" style={{ marginTop: '14px' }}>
          <DistribuicaoUfCard
            d={d}
            noData={noData}
            compare={compare}
            selectedUf={selectedUf}
            setSelectedUf={setSelectedUf}
            availableUfs={availableUfs}
          />
          <FrotaBaseCard
            d={d}
            noData={noData}
            compare={compare}
            selectedCompany={selectedCompany}
            setSelectedCompany={setSelectedCompany}
            availableCompanies={availableCompanies}
          />
        </div>
      </div>

      {/* Ranking de operadores — só MaxTrack, fora do modo comparação. Header
          da seção vive dentro do próprio card (ver OperatorRankingCard.jsx):
          sem isso, o título aparecia sozinho quando a planilha não tem a
          coluna de operador preenchida (card retorna null, header ficava órfão). */}
      {!compare && platformId === 'maxtrack' && (
        <OperatorRankingCard
          platformId={platformId}
          selectedSeverity={selectedSeverity}
        />
      )}
    </>
  );
}
