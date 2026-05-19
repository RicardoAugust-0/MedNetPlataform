export function Section({ icon, label, right }) {
  return (
    <div className="dg-section">
      <span className="dg-section-lb"><i className={`ti ${icon}`}></i> {label}</span>
      <span className="dg-section-rule"></span>
      {right}
    </div>
  );
}
