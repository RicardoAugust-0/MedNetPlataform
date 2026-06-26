export default function RobotIcon({ size = 20, style }) {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{ display: 'block', flexShrink: 0, ...style }}
    >
      <rect x="46" y="10" width="8" height="15" rx="4" fill="#F26931" />
      <rect x="0" y="45" width="10" height="30" rx="5" fill="#F26931" />
      <rect x="90" y="45" width="10" height="30" rx="5" fill="#F26931" />
      <rect x="15" y="25" width="70" height="60" rx="15" fill="#F26931" />
      <circle cx="35" cy="50" r="8" fill="#FFFFFF" />
      <circle cx="65" cy="50" r="8" fill="#FFFFFF" />
      <rect x="30" y="70" width="10" height="5" rx="1" fill="#FFFFFF" />
      <rect x="45" y="70" width="10" height="5" rx="1" fill="#FFFFFF" />
      <rect x="60" y="70" width="10" height="5" rx="1" fill="#FFFFFF" />
    </svg>
  );
}
