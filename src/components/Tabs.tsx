import React from "react"

type Props = {
  value: "planning" | "absences" | "admin"
  onChange: (v: "planning" | "absences" | "admin") => void
  isAdmin: boolean
}

export default function Tabs({ value, onChange, isAdmin }: Props) {
  const TabBtn = ({ k, label }: { k: Props["value"]; label: string }) => (
    <button
      onClick={() => onChange(k)}
      style={{
        padding: "8px 12px",
        borderRadius: 8,
        border: value === k ? "2px solid #333" : "1px solid #ccc",
        background: value === k ? "#f2f2f2" : "white",
        fontWeight: value === k ? 700 : 500,
        cursor: "pointer"
      }}
    >
      {label}
    </button>
  )

  return (
    <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
      <TabBtn k="planning" label="Planning" />
      <TabBtn k="absences" label="Absences" />
      {isAdmin && <TabBtn k="admin" label="Admin" />}
    </div>
  )
}
