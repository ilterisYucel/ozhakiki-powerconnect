const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const dataPath = path.join(__dirname, "data", "status.json");

const readData = () => {
  try {
    const rawData = fs.readFileSync(dataPath);
    return JSON.parse(rawData);
  } catch (error) {
    console.error("Error reading data file:", error);
    return { racks: [], metadata: { total: 0 } };
  }
};

// ============ ÖNCE SPESİFİK ROUTE'LAR (ALL) ============

// Tüm rack'lerin charge_status'ünü güncelle (ALL önce gelmeli!)
app.put("/api/racks/all/charge-status", (req, res) => {
  console.log("PUT /api/racks/all/charge-status - İstek geldi!");
  const data = readData();
  const { charge_status } = req.body;

  if (!["Charge", "Discharge", "Idle"].includes(charge_status)) {
    return res.status(400).json({ error: "Invalid charge_status" });
  }

  // Tüm rack'leri güncelle
  data.racks.forEach((rack) => {
    rack.charge_status = charge_status;
    rack.timestamp = new Date().toISOString();
  });

  data.metadata.lastUpdated = new Date().toISOString();

  try {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    res.json({
      message: `All racks charge status updated to ${charge_status}`,
      updatedCount: data.racks.length,
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update charge status" });
  }
});

// ============ SONRA PARAMETRELİ ROUTE'LAR (ID) ============

// Tek bir rack'in status'ünü güncelle
app.put("/api/racks/:id/status", (req, res) => {
  console.log(`PUT /api/racks/${req.params.id}/status - İstek geldi!`);
  const data = readData();
  const rackIndex = data.racks.findIndex(
    (r) => r.id === parseInt(req.params.id),
  );

  if (rackIndex === -1) {
    return res.status(404).json({ error: "Rack not found" });
  }

  const { status } = req.body;
  if (!["online", "offline"].includes(status)) {
    return res
      .status(400)
      .json({ error: 'Invalid status. Must be "online" or "offline"' });
  }

  data.racks[rackIndex].status = status;
  data.racks[rackIndex].timestamp = new Date().toISOString();
  data.metadata.lastUpdated = new Date().toISOString();

  try {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    res.json({
      message: "Status updated successfully",
      rack: data.racks[rackIndex],
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update status" });
  }
});

// Tek bir rack'in charge_status'ünü güncelle
app.put("/api/racks/:id/charge-status", (req, res) => {
  console.log(`PUT /api/racks/${req.params.id}/charge-status - İstek geldi!`);
  const data = readData();
  const rackIndex = data.racks.findIndex(
    (r) => r.id === parseInt(req.params.id),
  );

  if (rackIndex === -1) {
    return res.status(404).json({ error: "Rack not found" });
  }

  const { charge_status } = req.body;
  if (!["Charge", "Discharge", "Idle"].includes(charge_status)) {
    return res.status(400).json({
      error: 'Invalid charge_status. Must be "Charge", "Discharge", or "Idle"',
    });
  }

  data.racks[rackIndex].charge_status = charge_status;
  data.racks[rackIndex].timestamp = new Date().toISOString();
  data.metadata.lastUpdated = new Date().toISOString();

  try {
    fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
    res.json({
      message: "Charge status updated successfully",
      rack: data.racks[rackIndex],
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to update charge status" });
  }
});

// ============ GET ROUTE'LAR ============

// Tüm rack'ler
app.get("/api/racks", (req, res) => {
  const data = readData().racks;
  res.json(data);
});

// Sadece online rack'ler
app.get("/api/racks/online", (req, res) => {
  const data = readData();
  const onlineRacks = data.racks.filter((rack) => rack.status === "online");
  res.json({ racks: onlineRacks, metadata: data.metadata });
});

// Sadece offline rack'ler
app.get("/api/racks/offline", (req, res) => {
  const data = readData();
  const offlineRacks = data.racks.filter((rack) => rack.status === "offline");
  res.json({ racks: offlineRacks, metadata: data.metadata });
});

// ID'ye göre
app.get("/api/racks/:id", (req, res) => {
  const data = readData();
  const rack = data.racks.find((r) => r.id === parseInt(req.params.id));
  if (rack) {
    res.json(rack);
  } else {
    res.status(404).json({ error: "Rack not found" });
  }
});

// İstatistikler
app.get("/api/stats", (req, res) => {
  const data = readData();
  const onlineCount = data.racks.filter((r) => r.status === "online").length;
  const offlineCount = data.racks.filter((r) => r.status === "offline").length;

  const avgSoC =
    data.racks.reduce((sum, r) => sum + r.soc, 0) / data.racks.length;
  const avgSoH =
    data.racks.reduce((sum, r) => sum + r.soh, 0) / data.racks.length;
  const avgVoltage =
    data.racks.reduce((sum, r) => sum + r.voltage, 0) / data.racks.length;

  const chargeStatusDist = {
    Charge: data.racks.filter((r) => r.charge_status === "Charge").length,
    Discharge: data.racks.filter((r) => r.charge_status === "Discharge").length,
    Idle: data.racks.filter((r) => r.charge_status === "Idle").length,
  };

  res.json({
    totalRacks: data.racks.length,
    online: onlineCount,
    offline: offlineCount,
    onlinePercentage: ((onlineCount / data.racks.length) * 100).toFixed(1),
    averages: {
      soc: avgSoC.toFixed(1),
      soh: avgSoH.toFixed(1),
      voltage: avgVoltage.toFixed(0),
    },
    chargeStatus: chargeStatusDist,
    lastUpdated: data.metadata.lastUpdated,
  });
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString() });
});

// Timer için endpoint
app.post("/api/schedule", (req, res) => {
  const { command, durationMinutes } = req.body;

  setTimeout(
    async () => {
      const data = readData();
      data.racks.forEach((rack) => {
        rack.charge_status = "Idle";
        rack.timestamp = new Date().toISOString();
      });
      data.metadata.lastUpdated = new Date().toISOString();
      fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

      console.log(
        `Timer completed: ${command} finished after ${durationMinutes} minutes`,
      );
    },
    durationMinutes * 60 * 1000,
  );

  res.json({ message: `Timer scheduled for ${durationMinutes} minutes` });
});

app.listen(PORT, () => {
  console.log(`🔋 Battery Rack API running on http://localhost:${PORT}`);
  console.log(`📊 Endpoints:`);
  console.log(`   - All racks: http://localhost:${PORT}/api/racks`);
  console.log(
    `   - All charge-status: PUT http://localhost:${PORT}/api/racks/all/charge-status`,
  );
  console.log(`   - Stats: http://localhost:${PORT}/api/stats`);
});
