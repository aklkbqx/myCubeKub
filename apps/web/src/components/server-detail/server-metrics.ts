export function formatPercent(value: number) {
  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function getUsageTone(percent: number) {
  if (percent >= 85) {
    return {
      label: "High",
      textClassName: "text-red-300",
      fillClassName: "bg-red-400",
    };
  }

  if (percent >= 60) {
    return {
      label: "Moderate",
      textClassName: "text-amber-300",
      fillClassName: "bg-amber-400",
    };
  }

  return {
    label: "Low",
    textClassName: "text-emerald-300",
    fillClassName: "bg-emerald-400",
  };
}
