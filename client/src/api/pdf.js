// client/src/api/pdf.js

// Optional: alter Single-PDF-Endpunkt (kannst du später löschen)
export async function generatePDF(payload) {
    const res = await fetch("http://localhost:5656/api/pdf/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  
    if (!res.ok) {
      throw new Error("PDF Fehler (Single)");
    }
  
    return await res.blob();
  }
  
  // NEU: Multi-PDF mit Puppeteer
  export async function generateMultiPDF(recipients, template) {
    const res = await fetch("http://localhost:5656/api/pdf/generate-multi", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipients, template })
    });
  
    if (!res.ok) {
      throw new Error("PDF Fehler (Multi)");
    }
  
    const blob = await res.blob();
    return blob;
  }
  