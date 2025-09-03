import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell
} from "recharts";

export default function PopupPanel({
  title,
  toolData,
  onClose,
  top = "10%",
  left = "60%",
  glowColor = "#00E8FC",
}) {
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setChartData([
        { name: "Uptime", value: randomize(toolData.availability_pct) },
        { name: "Prod.", value: randomize(toolData.performance_pct) },
        { name: "Idle", value: randomize(toolData.quality_pct) },
        { name: "Down", value: randomize(toolData.oee_pct) },
      ]);
    }, 1000);
    return () => clearInterval(interval);
  }, [toolData]);

  const randomize = (base) => {
    const variance = Math.random() * 4 - 2; // ±2%
    return Math.max(0, Math.min(100, parseFloat((base + variance).toFixed(1))));
  };

  return (
    <div
      style={{
        position: "absolute",
        top,
        left,
        width: "260px",
        backgroundColor: "#1a1a1a",
        border: `2px solid ${glowColor}`,
        borderRadius: "10px",
        padding: "12px",
        zIndex: 20, // Ensure above video overlay
        color: "white",
        boxShadow: `0 0 15px ${glowColor}66`,
        fontSize: "12px",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ margin: 0 }}>{title}</h4>
        <button
          onClick={onClose}
          style={{ background: "none", color: "white", border: "none", cursor: "pointer" }}
        >
          ✕
        </button>
      </div>

      {/* Basic Info */}
      <p><strong>ID:</strong> {toolData.id}</p>
      <p><strong>Status:</strong> {toolData.status}</p>
      <p><strong>Cycle:</strong> {toolData.actual_cycle_time}s (Exp: {toolData.expected_cycle_time})</p>

      {/* Chart */}
      <div style={{ height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <XAxis dataKey="name" stroke="#ccc" />
            <YAxis domain={[0, 100]} stroke="#ccc" />
            <Tooltip />
            <Bar dataKey="value">
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={glowColor} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
