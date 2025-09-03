import React, { useEffect, useState } from "react";
import {
  useRive,
  useViewModel,
  useViewModelInstance,
  useViewModelInstanceNumber,
  useViewModelInstanceString,
} from "@rive-app/react-webgl2";
import FactoryVideo from "../../assets/Factory.webm";
import SensorIcon from "../../assets/Sensor.svg";
import SensorIcon1 from "../../assets/Sensor1.svg";
import PopupPanel from "../PopupPanel";
import toolStats from "../mock/mockToolData";
import { startExcelStream, subscribe, stopStream, startRandomBindingsStream } from "../excelParse/csvDataService";
//import { startMockStream, subscribe, stopMockStream } from "../mockDataService";

export default function DashboardRive() {
  const { rive, RiveComponent } = useRive({
    src: "/fabsim_prototype.riv",
    stateMachines: ["22.T-93_UI"],
    artboard: "UI_art 3",
    autoplay: true,
    autoBind: true,
  });

  const viewModel = useViewModel(rive, { name: "ProgressModel" });
  const viewModelInstance = useViewModelInstance(viewModel, { rive });

  // Bindings
  const bindings = {
    setOEE: useViewModelInstanceNumber("OEE", viewModelInstance).setValue,
    setWipLots: useViewModelInstanceNumber("WIP LOTS", viewModelInstance).setValue,
    setWipLotsAdd: useViewModelInstanceNumber("WIP LOTS ADD", viewModelInstance).setValue,
    setActiveTools: useViewModelInstanceNumber("ACTIVE TOOLS", viewModelInstance).setValue,
    setActiveToolsPercent: useViewModelInstanceNumber("ACTIVE TOOLS PERCENT", viewModelInstance).setValue,
    setWipMax: useViewModelInstanceNumber("WIP MAX", viewModelInstance).setValue,
    setWipMin: useViewModelInstanceNumber("WIP MIN", viewModelInstance).setValue,
    setWipSize: useViewModelInstanceNumber("WIP SIZE", viewModelInstance).setValue,
    setCapacity: useViewModelInstanceNumber("CAPACITY", viewModelInstance).setValue,
    setCapacity2: useViewModelInstanceNumber("CAPACITY2", viewModelInstance).setValue,
    setWeeklyAvg: useViewModelInstanceNumber("MIW", viewModelInstance).setValue,
    setInspect: useViewModelInstanceNumber("MII", viewModelInstance).setValue,
    setRatio: useViewModelInstanceNumber("MIR", viewModelInstance).setValue,
    setPctOEE: useViewModelInstanceNumber("PCTOEE", viewModelInstance).setValue,
    setQuality: useViewModelInstanceNumber("QUALITY", viewModelInstance).setValue,
    setPerformance: useViewModelInstanceNumber("PERFORMANCE", viewModelInstance).setValue,
    setAvailability: useViewModelInstanceNumber("AVALIABILITY", viewModelInstance).setValue,
    setToolTop: useViewModelInstanceNumber("TOOLTOP", viewModelInstance).setValue,
    setToolBottom: useViewModelInstanceNumber("TOOLBOTTOM", viewModelInstance).setValue,
    setLotsIdle: useViewModelInstanceNumber("LOTSIDLE", viewModelInstance).setValue,
    setLotsInQueue: useViewModelInstanceNumber("LIQ", viewModelInstance).setValue,
    setLotsInProd: useViewModelInstanceNumber("LIP", viewModelInstance).setValue,
    setOrder1Progress: useViewModelInstanceNumber("ORDER1_LOTS", viewModelInstance).setValue,
    setOrder1ETA: useViewModelInstanceNumber("ORDER1_ETA", viewModelInstance).setValue,
    setOrder1ID: useViewModelInstanceNumber("ORDER1_ID", viewModelInstance).setValue,
    setOrder2Progress: useViewModelInstanceNumber("ORDER2_LOTS", viewModelInstance).setValue,
    setOrder2ETA: useViewModelInstanceNumber("ORDER2_ETA", viewModelInstance).setValue,
    setOrder2ID: useViewModelInstanceNumber("ORDER2_ID", viewModelInstance).setValue,
    setOrder3Progress: useViewModelInstanceNumber("ORDER3_LOTS", viewModelInstance).setValue,
    setOrder3ETA: useViewModelInstanceNumber("ORDER3_ETA", viewModelInstance).setValue,
    setOrder3ID: useViewModelInstanceNumber("ORDER3_ID", viewModelInstance).setValue,
    setNextOrderNum: useViewModelInstanceNumber("NEXT_ORDER_NUM", viewModelInstance).setValue,
    setNextOrderProgress: useViewModelInstanceNumber("NEXT_ORDER_PROGRESS", viewModelInstance).setValue,
    setTarget: useViewModelInstanceNumber("TARGET", viewModelInstance).setValue,
    setOrdersDone: useViewModelInstanceNumber("ORDERSDONE", viewModelInstance).setValue,
    setAvgEta: useViewModelInstanceNumber("AVGETA", viewModelInstance).setValue,
    setDate: useViewModelInstanceString("Date", viewModelInstance).setValue,
    setTime: useViewModelInstanceString("Time", viewModelInstance).setValue,
    setTotalLots: useViewModelInstanceNumber("WIPCount", viewModelInstance).setValue,
  };

  const [hoveredButton, setHoveredButton] = useState(null);
  const [activePanel, setActivePanel] = useState(null);
  const [showVideo, setShowVideo] = useState(false);

  // Delay video start
  useEffect(() => {
    const t = setTimeout(() => setShowVideo(true), 2000);
    return () => clearTimeout(t);
  }, []);

  // Start stream when ready
  useEffect(() => {
    const allReady = rive?.loaded && viewModelInstance && Object.values(bindings).every(Boolean);
    if (!allReady) {
      console.log("Waiting for Rive + bindings...");
      return;
    }

    console.log(" Starting Excel stream...");
    //startExcelStream(2000);
    startRandomBindingsStream(4000, bindings, { maxTicks: 1000, startDate: new Date("2023-07-01T00:00:00Z"),});
  
    const updateOrderTracker = (data) => {
      const allOrders = data.orders || [];
      const activeOrders = allOrders.filter((o) => o.currentLot < 30);
      activeOrders.sort((a, b) => a.eta - b.eta);
      const [o3, o2, o1] = activeOrders;

      if (o3) {
        bindings.setOrder3Progress((o3.currentLot / 30) * 30);
        bindings.setOrder3ETA(o3.eta);
        bindings.setOrder3ID(o3.id);
        bindings.setNextOrderNum(o3.id);
        bindings.setNextOrderProgress((o3.currentLot / 30) * 100);
      }
      if (o2) {
        bindings.setOrder2Progress((o2.currentLot / 30) * 30);
        bindings.setOrder2ETA(o2.eta);
        bindings.setOrder2ID(o2.id);
      }
      if (o1) {
        bindings.setOrder1Progress((o1.currentLot / 30) * 30);
        bindings.setOrder1ETA(o1.eta);
        bindings.setOrder1ID(o1.id);
      }

      const etaList = [o1?.eta, o2?.eta, o3?.eta].filter((e) => e !== undefined);
      bindings.setAvgEta(etaList.length ? etaList.reduce((a, b) => a + b, 0) / etaList.length : 0);
      bindings.setOrdersDone(data.ordersDone || 0);
    };

    const unsub = subscribe(({ tick, formatted, series, waferStarts, random  }) => {
      /*
      bindings.setOEE(series.oee[tick]);
      bindings.setWipLots(series.wipLots ? series.wipLots[tick] : null);
      bindings.setWipLotsAdd(series.wipLotsAdd ? series.wipLotsAdd[tick] : null);
      bindings.setActiveTools(series.activeTools ? series.activeTools[tick] : null);
      bindings.setActiveToolsPercent(series.activeToolsPercent ? series.activeToolsPercent[tick] : null);
      bindings.setInspect(series.inspect ? series.inspect[tick] : null);
      bindings.setRatio(series.moi ? series.moi[tick] : null); // M/I ratio
      bindings.setWeeklyAvg(series.weeklyAvg ? series.weeklyAvg[tick] : null);
      bindings.setWipMax(series.wipMax ? series.wipMax[tick] : null);
      bindings.setWipMin(series.wipMin ? series.wipMin[tick] : null);
      bindings.setWipSize(series.wipSize ? series.wipSize[tick] : null);
      bindings.setCapacity(series.capacityDaily ? series.capacityDaily[tick] : null);
      bindings.setCapacity2(series.capacity2 ? series.capacity2[tick] : null);
      bindings.setPctOEE(series.pctOee ? series.pctOee[tick] : null);
      bindings.setQuality(series.quality ? series.quality[tick] : null);
      bindings.setPerformance(series.performance ? series.performance[tick] : null);
      bindings.setAvailability(series.availability ? series.availability[tick] : null);
      bindings.setToolTop(series.toolTop ? series.toolTop[tick] : null);
      bindings.setToolBottom(series.toolBottom ? series.toolBottom[tick] : null);
      bindings.setLotsIdle(series.lotsIdle ? series.lotsIdle[tick] : null);
      bindings.setLotsInQueue(series.liq ? series.liq[tick] : null);
      bindings.setLotsInProd(series.lip ? series.lip[tick] : null);
      bindings.setTarget(series.target ? series.target[tick] : null);
      updateOrderTracker({ tick, series });
      */
     if (random) {
      // Random mode → values already bound inside startRandomBindingsStream
      bindings.setDate(formatted.date);
      bindings.setTime(formatted.time);
      // 🔹 Generate random orders right here
    const randomOrders = Array.from({ length: 5 }, () => ({
      id: 1000 + Math.floor(Math.random() * 999),
      currentLot: Math.floor(Math.random() * 31), // 0–30
      totalLots: 30,                              // fixed at 30 for your tracker
      eta: Math.floor(Math.random() * 44) + 5,    // 5–48
    }));

    const orderData = { orders: randomOrders, ordersDone: Math.floor(Math.random() * 10) };

    // 🔹 Call your existing tracker with these
    updateOrderTracker(orderData);
    } else {
      // Excel mode → bind values from series
      bindings.setTotalLots(waferStarts);
      bindings.setWipMax(series.wipMax ? series.wipMax[tick] : null);
      bindings.setWipMin(series.wipMin ? series.wipMin[tick] : null);
      bindings.setWipSize(series.wipSize ? series.wipSize[tick] : null);
      bindings.setRatio(series.moi ? series.moi[tick] : null);
      bindings.setInspect(series.moiInspect ? series.moiInspect[tick] : null);
      bindings.setDate(formatted.date);
      bindings.setTime(formatted.time);
      bindings.setCapacity(series.startedWip ? series.startedWip[tick] : null);
      bindings.setCapacity2(series.exitedWip ? series.exitedWip[tick] : null);
    }
  });
    return () => {
      unsub();
      stopStream();
    };
  }, [rive, viewModelInstance, ...Object.values(bindings)]);

  const buttons = [
    { id: "sensor", icon: SensorIcon, top: "45%", left: "27%", glowColor: "blue" },
    { id: "machine", icon: SensorIcon, top: "50%", left: "31%", glowColor: "blue" },
    { id: "quality", icon: SensorIcon, top: "58%", left: "40%", glowColor: "blue" },
    { id: "supply", icon: SensorIcon, top: "63%", left: "46%", glowColor: "blue" },
    { id: "logistics", icon: SensorIcon1, top: "35%", left: "58%", glowColor: "red" },
    { id: "energy", icon: SensorIcon1, top: "29%", left: "52%", glowColor: "red" },
    { id: "maintenance", icon: SensorIcon1, top: "40%", left: "64%", glowColor: "red" },
    { id: "alerts", icon: SensorIcon1, top: "23%", left: "46%", glowColor: "red" },
  ];

  return (
    <div style={{ position: "relative", width: 1800, height: 1200 }}>
      <RiveComponent />
      {showVideo && (
        <video
          src={FactoryVideo}
          autoPlay
          muted
          loop
          style={{
            position: "absolute",
            top: "19%",
            left: "24%",
            width: "55%",
            height: "55%",
            zIndex: 2,
            borderRadius: "8px",
            opacity: showVideo ? 1 : 0,
            transition: "opacity 1s ease-in",
          }}
        />
      )}
      {showVideo &&
        buttons.map((btn) => (
          <div
            key={btn.id}
            style={{
              position: "absolute",
              top: btn.top,
              left: btn.left,
              zIndex: 3,
              cursor: "pointer",
            }}
            onMouseEnter={() => setHoveredButton(btn.id)}
            onMouseLeave={() => setHoveredButton(null)}
            onClick={() => setActivePanel(btn)}
          >
            <img
              src={btn.icon}
              alt={btn.id}
              style={{
                width: hoveredButton === btn.id ? 50 : 40,
                height: hoveredButton === btn.id ? 50 : 40,
                transition: "all 0.3s ease",
                filter:
                  hoveredButton === btn.id
                    ? `drop-shadow(0 0 10px ${btn.glowColor === "red" ? "#FF4C4C" : "#00E8FC"})`
                    : "none",
                transform: hoveredButton === btn.id ? "scale(1.1)" : "scale(1)",
              }}
            />
          </div>
        ))}
      {activePanel && toolStats[activePanel.id] && (
        <PopupPanel
          title={`Tool Info - ${activePanel.id}`}
          toolData={toolStats[activePanel.id]}
          onClose={() => setActivePanel(null)}
          top={activePanel.top}
          left={activePanel.left}
          glowColor={activePanel.glowColor === "red" ? "#FF4C4C" : "#00E8FC"}
        />
      )}
    </div>
  );
}
