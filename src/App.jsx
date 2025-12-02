import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './App.css';

const TBMMISimulation = () => {
  const [activeView, setActiveView] = useState('overview');
  const [time, setTime] = useState(0);
  const [isRunning, setIsRunning] = useState(true);
  
  const [muckConductivity, setMuckConductivity] = useState(0.5);
  const [frequency, setFrequency] = useState(25000);
  const [txPower, setTxPower] = useState(0.5);
  const [distance, setDistance] = useState(1.5);
  const [bitRate, setBitRate] = useState(250);
  
  const [txLoopDiameter, setTxLoopDiameter] = useState(30);
  const [rxLoopDiameter, setRxLoopDiameter] = useState(30);
  const [txTurns, setTxTurns] = useState(20);
  const [rxTurns, setRxTurns] = useState(30);
  const [wireGauge, setWireGauge] = useState(18);
  
  const [nodeState, setNodeState] = useState('sleep');
  const [batteryMah, setBatteryMah] = useState(3500);
  const [signalStrength, setSignalStrength] = useState(0);
  
  const MU_0 = 4 * Math.PI * 1e-7;
  
  const calculations = useMemo(() => {
    const omega = 2 * Math.PI * frequency;
    const skinDepth = Math.sqrt(2 / (omega * MU_0 * muckConductivity));
    
    const txRadius = (txLoopDiameter / 100) / 2;
    const txArea = Math.PI * txRadius * txRadius;
    
    const wireResistancePerMeter = { 14: 0.00828, 16: 0.0132, 18: 0.0210, 20: 0.0333, 22: 0.0530, 24: 0.0842 };
    const rhoWire = wireResistancePerMeter[wireGauge] || 0.0210;
    
    const txWireLength = txTurns * 2 * Math.PI * txRadius;
    const txR_dc = txWireLength * rhoWire;
    
    const wireDiameter = { 14: 1.63, 16: 1.29, 18: 1.02, 20: 0.81, 22: 0.64, 24: 0.51 };
    const wireD = (wireDiameter[wireGauge] || 1.02) / 1000;
    const skinDepthCopper = Math.sqrt(2 / (omega * MU_0 * 5.8e7));
    const skinFactor = wireD > 2 * skinDepthCopper ? wireD / (2 * skinDepthCopper) : 1;
    const txR_ac = txR_dc * skinFactor;
    
    const txL = MU_0 * txTurns * txTurns * txRadius * (Math.log(8 * txRadius / (wireD/2)) - 2);
    const txQ = omega * txL / txR_ac;
    const txC = 1 / (omega * omega * txL);
    
    const rxRadius = (rxLoopDiameter / 100) / 2;
    const rxArea = Math.PI * rxRadius * rxRadius;
    
    const rxWireLength = rxTurns * 2 * Math.PI * rxRadius;
    const rxR_dc = rxWireLength * rhoWire;
    const rxR_ac = rxR_dc * skinFactor;
    
    const rxL = MU_0 * rxTurns * rxTurns * rxRadius * (Math.log(8 * rxRadius / (wireD/2)) - 2);
    const rxQ = omega * rxL / rxR_ac;
    const rxC = 1 / (omega * omega * rxL);
    
    const magneticMoment = txTurns * txPower * txArea;
    const H_field = magneticMoment / (2 * Math.PI * Math.pow(distance, 3));
    
    const attenuationFactor = Math.exp(-distance / skinDepth);
    const attenuation_dB = 20 * Math.log10(attenuationFactor);
    
    const H_rx = H_field * attenuationFactor;
    const B_rx = MU_0 * H_rx;
    
    const V_induced = rxTurns * rxArea * omega * B_rx;
    const effectiveQ = Math.min(rxQ, 150);
    const V_after_resonance = V_induced * effectiveQ;
    
    const sleepCurrent_uA = 4;
    const txCurrent_mA = txPower * 1000;
    const txDutyCycle = 0.01;
    const avgCurrent_uA = sleepCurrent_uA * (1 - txDutyCycle) + txCurrent_mA * 1000 * txDutyCycle;
    const batteryLife_hours = (batteryMah * 1000) / avgCurrent_uA;
    const batteryLife_years = batteryLife_hours / 8760;
    
    const noiseFloor_V = 200e-6;
    const SNR_linear = V_after_resonance / noiseFloor_V;
    const SNR_dB = 20 * Math.log10(Math.max(SNR_linear, 1e-9));
    const linkMargin = SNR_dB - 12;
    
    return {
      skinDepth, attenuation_dB, attenuationFactor,
      txArea: txArea * 1e4, txL: txL * 1e6, txQ, txR_ac: txR_ac * 1000,
      rxArea: rxArea * 1e4, rxL: rxL * 1e6, rxQ, rxR_ac: rxR_ac * 1000, effectiveQ,
      magneticMoment, H_rx: H_rx * 1e6, V_induced: V_induced * 1e6, V_after_resonance: V_after_resonance * 1e3,
      avgCurrent_uA, batteryLife_years, SNR_dB, linkMargin, noiseFloor_V: noiseFloor_V * 1e6,
      Q: rxQ, L: rxL * 1e6, C: rxC * 1e9
    };
  }, [frequency, muckConductivity, distance, txLoopDiameter, rxLoopDiameter, txTurns, rxTurns, txPower, batteryMah, wireGauge]);
  
  useEffect(() => {
    if (!isRunning) return;
    const interval = setInterval(() => setTime(t => t + 1), 50);
    return () => clearInterval(interval);
  }, [isRunning]);
  
  // Communication cycle: 1 transmission per second (20 frames × 50ms = 1000ms)
  useEffect(() => {
    const cycle = time % 20;
    if (cycle < 14) { setNodeState('sleep'); setSignalStrength(0); }
    else if (cycle < 16) { setNodeState('wake'); setSignalStrength(0.3); }
    else if (cycle < 19) { setNodeState('tx'); setSignalStrength(Math.sin((cycle - 16) * 1.0) * 0.5 + 0.5); }
    else { setNodeState('rx'); setSignalStrength(0.2); }
  }, [time]);

  const SystemOverview = () => (
    <svg viewBox="0 0 1000 600" className="w-full h-full">
      <defs>
        <linearGradient id="muckGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#3d2914" />
          <stop offset="50%" stopColor="#5c4020" />
          <stop offset="100%" stopColor="#3d2914" />
        </linearGradient>
        <linearGradient id="steelGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#5a6068" />
          <stop offset="50%" stopColor="#3a4048" />
          <stop offset="100%" stopColor="#2a3038" />
        </linearGradient>
        <filter id="softGlow">
          <feGaussianBlur stdDeviation="2" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      
      <rect x="0" y="0" width="1000" height="600" fill="#0a0e14" />
      <text x="500" y="35" textAnchor="middle" fill="#e6edf3" fontSize="20" fontWeight="bold">
        TBM Magnetic Induction - {(frequency/1000).toFixed(0)} kHz | Air-Core Loops
      </text>
      
      {/* Cutterhead */}
      <g transform="translate(80, 100)">
        <rect x="0" y="0" width="280" height="350" fill="url(#steelGrad)" stroke="#4a5568" strokeWidth="2" rx="4" />
        <text x="140" y="30" textAnchor="middle" fill="#e6edf3" fontSize="14" fontWeight="bold">CUTTERHEAD NODE</text>
        <text x="140" y="50" textAnchor="middle" fill="#8b949e" fontSize="11">(Rotating, Battery Powered)</text>
        
        <g transform="translate(20, 70)">
          <rect x="0" y="0" width="100" height="45" fill="#1a1f26" stroke="#238636" strokeWidth="2" rx="3" />
          <text x="50" y="18" textAnchor="middle" fill="#238636" fontSize="10" fontWeight="bold">Arduino Nano</text>
          <text x="50" y="32" textAnchor="middle" fill="#7ee787" fontSize="8">ATmega328P 16MHz</text>
          <circle cx="85" cy="10" r="4" fill={nodeState !== 'sleep' ? "#7ee787" : "#21262d"}>
            {nodeState !== 'sleep' && <animate attributeName="opacity" values="1;0.3;1" dur="0.5s" repeatCount="indefinite" />}
          </circle>
        </g>
        
        <g transform="translate(140, 70)">
          <rect x="0" y="0" width="100" height="45" fill="#1a1f26" stroke="#a371f7" strokeWidth="2" rx="3" />
          <text x="50" y="18" textAnchor="middle" fill="#a371f7" fontSize="10" fontWeight="bold">Si5351A</text>
          <text x="50" y="32" textAnchor="middle" fill="#d2a8ff" fontSize="8">{(frequency/1000).toFixed(0)} kHz PLL</text>
        </g>
        
        <g transform="translate(20, 130)">
          <rect x="0" y="0" width="220" height="70" fill="#1a1f26" stroke="#f0883e" strokeWidth="2" rx="3" />
          <text x="110" y="18" textAnchor="middle" fill="#f0883e" fontSize="10" fontWeight="bold">IRFZ44N H-Bridge</text>
          <g transform="translate(30, 25)">
            {[[0,0], [60,0], [0,30], [60,30]].map(([x, y], i) => (
              <g key={i} transform={`translate(${x}, ${y})`}>
                <rect x="0" y="0" width="20" height="15" fill={nodeState === 'tx' ? "#f0883e" : "#21262d"} stroke="#f0883e" rx="2" />
                <text x="10" y="10" textAnchor="middle" fill="#fff" fontSize="6">Q{i+1}</text>
              </g>
            ))}
            <line x1="20" y1="7" x2="60" y2="7" stroke="#f0883e" strokeWidth="1" />
            <line x1="20" y1="37" x2="60" y2="37" stroke="#f0883e" strokeWidth="1" />
          </g>
          <text x="160" y="45" textAnchor="middle" fill="#ffa657" fontSize="9">{nodeState === 'tx' ? `${txPower.toFixed(1)}A peak` : '0A'}</text>
        </g>
        
        <g transform="translate(20, 215)">
          <rect x="0" y="0" width="220" height="55" fill="#1a1f26" stroke="#58a6ff" strokeWidth="2" rx="3" />
          <text x="110" y="16" textAnchor="middle" fill="#58a6ff" fontSize="10" fontWeight="bold">TX Loop Antenna</text>
          <g transform="translate(30, 25)">
            {[0, 1, 2, 3, 4].map(i => (
              <ellipse key={i} cx={20 + i * 8} cy="12" rx="15" ry="12" fill="none" stroke="#58a6ff" strokeWidth="1.5" opacity={0.4 + i * 0.15} />
            ))}
            {nodeState === 'tx' && (
              <ellipse cx="52" cy="12" rx="18" ry="15" fill="none" stroke="#79c0ff" strokeWidth="2" filter="url(#softGlow)">
                <animate attributeName="rx" values="15;22;15" dur="0.3s" repeatCount="indefinite" />
              </ellipse>
            )}
          </g>
          <text x="160" y="32" textAnchor="middle" fill="#79c0ff" fontSize="8">{txTurns}T × {txLoopDiameter}cm</text>
          <text x="160" y="44" textAnchor="middle" fill="#8b949e" fontSize="8">L={calculations.txL.toFixed(1)}µH Q={calculations.txQ.toFixed(0)}</text>
        </g>
        
        <g transform="translate(20, 280)">
          <rect x="0" y="0" width="100" height="50" fill="#1a1f26" stroke="#f778ba" strokeWidth="2" rx="3" />
          <text x="50" y="16" textAnchor="middle" fill="#f778ba" fontSize="9" fontWeight="bold">LC Tank</text>
          <text x="50" y="30" textAnchor="middle" fill="#ff9bce" fontSize="8">C={calculations.C.toFixed(0)}nF</text>
          <text x="50" y="42" textAnchor="middle" fill="#8b949e" fontSize="8">Q={calculations.Q.toFixed(0)}</text>
        </g>
        
        <g transform="translate(140, 280)">
          <rect x="0" y="0" width="100" height="50" fill="#1a1f26" stroke="#3fb950" strokeWidth="2" rx="3" />
          <text x="50" y="16" textAnchor="middle" fill="#3fb950" fontSize="9" fontWeight="bold">18650 Battery</text>
          <rect x="10" y="22" width="80" height="10" fill="#21262d" stroke="#3fb950" rx="2" />
          <rect x="10" y="22" width={80 * (batteryMah / 3500)} height="10" fill="#3fb950" rx="2" />
          <text x="50" y="45" textAnchor="middle" fill="#7ee787" fontSize="8">{batteryMah}mAh</text>
        </g>
        
        <g transform="translate(20, 340)">
          <rect x="0" y="0" width="220" height="25" fill="#21262d" rx="3" />
          <text x="10" y="17" fill="#8b949e" fontSize="10">State:</text>
          <text x="50" y="17" fill={nodeState === 'sleep' ? '#8b949e' : nodeState === 'wake' ? '#f0883e' : nodeState === 'tx' ? '#3fb950' : '#58a6ff'} fontSize="10" fontWeight="bold">
            {nodeState.toUpperCase()}
          </text>
          <text x="110" y="17" fill="#8b949e" fontSize="10">
            {nodeState === 'sleep' ? '4µA' : nodeState === 'tx' ? `${(txPower * 300).toFixed(0)}mA` : '20mA'}
          </text>
        </g>
      </g>
      
      {/* Muck Gap */}
      <g transform="translate(370, 100)">
        <rect x="0" y="0" width="200" height="350" fill="url(#muckGrad)" opacity="0.8" />
        <text x="100" y="30" textAnchor="middle" fill="#d4a574" fontSize="14" fontWeight="bold">MUCK GAP</text>
        <text x="100" y="50" textAnchor="middle" fill="#a67c52" fontSize="11">{distance}m wet soil</text>
        <text x="100" y="70" textAnchor="middle" fill="#a67c52" fontSize="10">σ = {muckConductivity} S/m</text>
        
        <g transform="translate(20, 90)">
          <text x="80" y="0" textAnchor="middle" fill="#d4a574" fontSize="10">Skin Depth δ = {calculations.skinDepth.toFixed(1)}m</text>
          <rect x="0" y="10" width="160" height="20" fill="#21262d" stroke="#a67c52" rx="2" />
          <rect x="0" y="10" width={Math.min(160, 160 * calculations.skinDepth / 5)} height="20" fill="#d4a574" rx="2" />
        </g>
        
        {nodeState === 'tx' && (
          <g transform="translate(0, 150)">
            {[0, 1, 2, 3, 4].map(i => {
              const phase = (time * 0.1 + i * 0.5) % 3;
              const x = phase * 70;
              const opacity = Math.max(0, 1 - phase * 0.4) * Math.exp(-x / (calculations.skinDepth * 50));
              return (
                <g key={i} opacity={opacity}>
                  <ellipse cx={x} cy="50" rx="10" ry="40" fill="none" stroke="#7ee787" strokeWidth="2" />
                </g>
              );
            })}
          </g>
        )}
        
        <g transform="translate(20, 280)">
          <text x="80" y="0" textAnchor="middle" fill="#d4a574" fontSize="10">Signal Attenuation</text>
          <text x="80" y="20" textAnchor="middle" fill={calculations.attenuation_dB > -20 ? "#3fb950" : calculations.attenuation_dB > -40 ? "#f0883e" : "#f85149"} fontSize="14" fontWeight="bold">
            {calculations.attenuation_dB.toFixed(1)} dB
          </text>
          <text x="80" y="40" textAnchor="middle" fill="#8b949e" fontSize="9">V_ind = {calculations.V_induced.toFixed(1)} µV</text>
          <text x="80" y="55" textAnchor="middle" fill="#3fb950" fontSize="9">V_res = {calculations.V_after_resonance.toFixed(2)} mV</text>
        </g>
      </g>
      
      {/* TBM Body */}
      <g transform="translate(580, 100)">
        <rect x="0" y="0" width="320" height="350" fill="url(#steelGrad)" stroke="#4a5568" strokeWidth="2" rx="4" />
        <text x="160" y="30" textAnchor="middle" fill="#e6edf3" fontSize="14" fontWeight="bold">TBM BODY RECEIVER</text>
        <text x="160" y="50" textAnchor="middle" fill="#8b949e" fontSize="11">(Stationary, Mains Powered)</text>
        
        <g transform="translate(20, 70)">
          <rect x="0" y="0" width="130" height="55" fill="#1a1f26" stroke="#58a6ff" strokeWidth="2" rx="3" />
          <text x="65" y="16" textAnchor="middle" fill="#58a6ff" fontSize="10" fontWeight="bold">RX Loop Antenna</text>
          <g transform="translate(15, 22)">
            {[0, 1, 2, 3, 4, 5].map(i => (
              <ellipse key={i} cx={15 + i * 5} cy="12" rx="12" ry="12" fill="none" stroke="#58a6ff" strokeWidth="1" opacity={0.3 + i * 0.1} />
            ))}
          </g>
          <text x="65" y="48" textAnchor="middle" fill="#79c0ff" fontSize="8">{rxTurns}T matched</text>
        </g>
        
        <g transform="translate(170, 70)">
          <rect x="0" y="0" width="130" height="55" fill="#1a1f26" stroke="#a371f7" strokeWidth="2" rx="3" />
          <text x="65" y="16" textAnchor="middle" fill="#a371f7" fontSize="10" fontWeight="bold">LNA Preamp</text>
          <text x="65" y="32" textAnchor="middle" fill="#d2a8ff" fontSize="8">Gain: 40dB</text>
          <text x="65" y="44" textAnchor="middle" fill="#8b949e" fontSize="8">NF &lt; 3dB</text>
        </g>
        
        <g transform="translate(20, 140)">
          <rect x="0" y="0" width="130" height="55" fill="#1a1f26" stroke="#f778ba" strokeWidth="2" rx="3" />
          <text x="65" y="16" textAnchor="middle" fill="#f778ba" fontSize="10" fontWeight="bold">BPF</text>
          <text x="65" y="32" textAnchor="middle" fill="#ff9bce" fontSize="8">{(frequency/1000).toFixed(0)}kHz ±500Hz</text>
          <text x="65" y="44" textAnchor="middle" fill="#8b949e" fontSize="8">Q=16</text>
        </g>
        
        <g transform="translate(170, 140)">
          <rect x="0" y="0" width="130" height="55" fill="#1a1f26" stroke="#f0883e" strokeWidth="2" rx="3" />
          <text x="65" y="16" textAnchor="middle" fill="#f0883e" fontSize="10" fontWeight="bold">RTL-SDR V3</text>
          <text x="65" y="32" textAnchor="middle" fill="#ffa657" fontSize="8">Direct Sampling</text>
          {(nodeState === 'tx' || nodeState === 'rx') && (
            <rect x="100" y="5" width="20" height="8" fill="#3fb950" rx="2">
              <animate attributeName="opacity" values="1;0.3;1" dur="0.3s" repeatCount="indefinite" />
            </rect>
          )}
        </g>
        
        <g transform="translate(20, 210)">
          <rect x="0" y="0" width="280" height="70" fill="#1a1f26" stroke="#238636" strokeWidth="2" rx="3" />
          <text x="140" y="18" textAnchor="middle" fill="#238636" fontSize="10" fontWeight="bold">FSK Demodulator @ {bitRate} bps</text>
          <g transform="translate(20, 28)">
            <rect x="0" y="0" width="240" height="35" fill="#0d1117" rx="2" />
            {nodeState === 'tx' && (
              <path 
                d={`M 0 17 ${Array.from({length: 60}, (_, i) => {
                  const bit = Math.floor(i / 10) % 2;
                  const f = bit ? 1.2 : 0.8;
                  return `L ${i * 4} ${17 + Math.sin(i * f + time * 0.3) * 12}`;
                }).join(' ')}`}
                fill="none" stroke="#3fb950" strokeWidth="1.5"
              />
            )}
          </g>
        </g>
        
        <g transform="translate(20, 295)">
          <rect x="0" y="0" width="280" height="40" fill="#1a1f26" stroke="#79c0ff" strokeWidth="2" rx="3" />
          <text x="140" y="16" textAnchor="middle" fill="#79c0ff" fontSize="10" fontWeight="bold">SCADA / Modbus Interface</text>
          <text x="140" y="32" textAnchor="middle" fill="#8b949e" fontSize="9">→ TBM Control System</text>
        </g>
      </g>
      
      {/* Bottom indicators */}
      <g transform="translate(370, 470)">
        <rect x="0" y="0" width="200" height="50" fill="#161b22" stroke="#30363d" rx="4" />
        <text x="100" y="18" textAnchor="middle" fill="#e6edf3" fontSize="11" fontWeight="bold">Link Quality</text>
        <rect x="15" y="25" width="170" height="15" fill="#21262d" rx="3" />
        <rect x="15" y="25" width={170 * signalStrength} height="15" fill={signalStrength > 0.7 ? "#3fb950" : signalStrength > 0.3 ? "#f0883e" : "#f85149"} rx="3" />
      </g>
      
      <g transform="translate(590, 470)">
        <rect x="0" y="0" width="150" height="50" fill="#161b22" stroke="#30363d" rx="4" />
        <text x="75" y="15" textAnchor="middle" fill="#e6edf3" fontSize="10" fontWeight="bold">Link Status</text>
        <text x="75" y="30" textAnchor="middle" fill={calculations.SNR_dB > 12 ? "#3fb950" : "#f85149"} fontSize="11">
          {calculations.SNR_dB > 12 ? "✓ VIABLE" : "✗ WEAK"}
        </text>
        <text x="75" y="44" textAnchor="middle" fill="#8b949e" fontSize="9">{bitRate}bps @ {calculations.SNR_dB.toFixed(0)}dB SNR</text>
      </g>
      
      <g transform="translate(760, 470)">
        <rect x="0" y="0" width="150" height="50" fill="#161b22" stroke="#30363d" rx="4" />
        <text x="75" y="18" textAnchor="middle" fill="#e6edf3" fontSize="11" fontWeight="bold">Battery Life</text>
        <text x="75" y="38" textAnchor="middle" fill="#3fb950" fontSize="14">{calculations.batteryLife_years.toFixed(1)} years</text>
      </g>
      
      <g transform="translate(80, 470)">
        <rect x="0" y="0" width="270" height="50" fill="#161b22" stroke="#30363d" rx="4" />
        <text x="135" y="18" textAnchor="middle" fill="#8b949e" fontSize="10">
          Simulation: {isRunning ? 'Running' : 'Paused'} | Frame: {time}
        </text>
        <text x="135" y="36" textAnchor="middle" fill="#58a6ff" fontSize="10">
          Adjust parameters below
        </text>
      </g>
    </svg>
  );

  const PhysicsView = () => (
    <svg viewBox="0 0 1000 600" className="w-full h-full">
      <rect x="0" y="0" width="1000" height="600" fill="#0a0e14" />
      <text x="500" y="35" textAnchor="middle" fill="#e6edf3" fontSize="20" fontWeight="bold">
        Electromagnetic Propagation Physics
      </text>
      
      {/* Skin Depth vs Frequency */}
      <g transform="translate(50, 70)">
        <rect x="0" y="0" width="440" height="240" fill="#161b22" stroke="#30363d" rx="4" />
        <text x="220" y="25" textAnchor="middle" fill="#e6edf3" fontSize="12" fontWeight="bold">Skin Depth vs Frequency (σ={muckConductivity} S/m)</text>
        
        <g transform="translate(50, 45)">
          <line x1="0" y1="160" x2="360" y2="160" stroke="#484f58" strokeWidth="1" />
          <line x1="0" y1="0" x2="0" y2="160" stroke="#484f58" strokeWidth="1" />
          
          {[0, 50, 100, 150, 200].map((v, i) => (
            <g key={i}>
              <text x="-10" y={160 - i * 40} textAnchor="end" fill="#8b949e" fontSize="9">{v}m</text>
              <line x1="0" y1={160 - i * 40} x2="360" y2={160 - i * 40} stroke="#21262d" strokeWidth="1" />
            </g>
          ))}
          
          {[1, 5, 10, 15, 20, 25].map((f, i) => (
            <text key={i} x={i * 60 + 30} y="175" textAnchor="middle" fill="#8b949e" fontSize="9">{f}kHz</text>
          ))}
          
          <path
            d={Array.from({length: 25}, (_, i) => {
              const f = (i + 1) * 1000;
              const delta = Math.sqrt(2 / (2 * Math.PI * f * MU_0 * muckConductivity));
              const x = i * 15;
              const y = 160 - Math.min(160, delta * 0.8);
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
            }).join(' ')}
            fill="none" stroke="#58a6ff" strokeWidth="2"
          />
          
          <g transform={`translate(${(frequency / 1000 - 1) * 15}, ${160 - Math.min(160, calculations.skinDepth * 0.8)})`}>
            <circle cx="0" cy="0" r="6" fill="#f0883e" stroke="#ffa657" strokeWidth="2" />
            <text x="10" y="4" fill="#ffa657" fontSize="10">δ = {calculations.skinDepth.toFixed(1)}m</text>
          </g>
          
          <line x1="0" y1={160 - distance * 0.8} x2="360" y2={160 - distance * 0.8} stroke="#f85149" strokeWidth="1" strokeDasharray="5,5" />
          <text x="365" y={160 - distance * 0.8 + 4} fill="#f85149" fontSize="9">d={distance}m</text>
        </g>
        <text x="220" y="230" textAnchor="middle" fill="#8b949e" fontSize="10">Frequency (kHz)</text>
      </g>
      
      {/* Attenuation vs Distance */}
      <g transform="translate(510, 70)">
        <rect x="0" y="0" width="440" height="240" fill="#161b22" stroke="#30363d" rx="4" />
        <text x="220" y="25" textAnchor="middle" fill="#e6edf3" fontSize="12" fontWeight="bold">Signal Attenuation vs Distance</text>
        
        <g transform="translate(50, 45)">
          <line x1="0" y1="160" x2="360" y2="160" stroke="#484f58" strokeWidth="1" />
          <line x1="0" y1="0" x2="0" y2="160" stroke="#484f58" strokeWidth="1" />
          
          {[0, -20, -40, -60, -80].map((v, i) => (
            <g key={i}>
              <text x="-10" y={i * 40 + 4} textAnchor="end" fill="#8b949e" fontSize="9">{v}dB</text>
              <line x1="0" y1={i * 40} x2="360" y2={i * 40} stroke="#21262d" strokeWidth="1" />
            </g>
          ))}
          
          {[0, 1, 2, 3, 4, 5].map((d, i) => (
            <text key={i} x={i * 72} y="175" textAnchor="middle" fill="#8b949e" fontSize="9">{d}m</text>
          ))}
          
          <path
            d={Array.from({length: 50}, (_, i) => {
              const d = i * 0.1;
              const atten = 20 * Math.log10(Math.exp(-d / calculations.skinDepth));
              const x = d * 72;
              const y = Math.min(160, -atten * 2);
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
            }).join(' ')}
            fill="none" stroke="#3fb950" strokeWidth="2"
          />
          
          <g transform={`translate(${distance * 72}, ${Math.min(160, -calculations.attenuation_dB * 2)})`}>
            <circle cx="0" cy="0" r="6" fill="#f0883e" stroke="#ffa657" strokeWidth="2" />
            <text x="10" y="4" fill="#ffa657" fontSize="10">{calculations.attenuation_dB.toFixed(1)}dB</text>
          </g>
        </g>
        <text x="220" y="230" textAnchor="middle" fill="#8b949e" fontSize="10">Distance (m)</text>
      </g>
      
      {/* LC Resonance */}
      <g transform="translate(50, 330)">
        <rect x="0" y="0" width="440" height="240" fill="#161b22" stroke="#30363d" rx="4" />
        <text x="220" y="25" textAnchor="middle" fill="#e6edf3" fontSize="12" fontWeight="bold">LC Tank Response (Q={calculations.Q.toFixed(0)})</text>
        
        <g transform="translate(50, 45)">
          <line x1="0" y1="160" x2="360" y2="160" stroke="#484f58" strokeWidth="1" />
          <line x1="0" y1="0" x2="0" y2="160" stroke="#484f58" strokeWidth="1" />
          
          <path
            d={Array.from({length: 72}, (_, i) => {
              const f = (i - 36) * 200 + frequency;
              const w = 2 * Math.PI * f;
              const w0 = 2 * Math.PI * frequency;
              const response = 1 / Math.sqrt(1 + Math.pow(calculations.Q * (w/w0 - w0/w), 2));
              const x = i * 5;
              const y = 160 - response * 150;
              return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
            }).join(' ')}
            fill="none" stroke="#a371f7" strokeWidth="2"
          />
          
          <line x1="180" y1="0" x2="180" y2="160" stroke="#f0883e" strokeWidth="1" strokeDasharray="3,3" />
          <text x="180" y="-5" textAnchor="middle" fill="#f0883e" fontSize="10">f₀ = {frequency}Hz</text>
        </g>
      </g>
      
      {/* Equations */}
      <g transform="translate(510, 330)">
        <rect x="0" y="0" width="440" height="240" fill="#161b22" stroke="#30363d" rx="4" />
        <text x="220" y="25" textAnchor="middle" fill="#e6edf3" fontSize="12" fontWeight="bold">Key Calculations</text>
        
        <g transform="translate(20, 50)">
          {[
            { label: 'Skin Depth δ:', value: `${calculations.skinDepth.toFixed(2)} m` },
            { label: 'TX Area:', value: `${calculations.txArea.toFixed(0)} cm²` },
            { label: 'TX Inductance:', value: `${calculations.txL.toFixed(1)} µH` },
            { label: 'TX Q:', value: `${calculations.txQ.toFixed(0)}` },
            { label: 'RX Inductance:', value: `${calculations.rxL.toFixed(1)} µH` },
            { label: 'RX Q:', value: `${calculations.rxQ.toFixed(0)}` },
            { label: 'Muck Loss:', value: `${calculations.attenuation_dB.toFixed(1)} dB` },
            { label: 'V_induced:', value: `${calculations.V_induced.toFixed(1)} µV` },
            { label: 'V_resonance:', value: `${calculations.V_after_resonance.toFixed(2)} mV` },
            { label: 'SNR:', value: `${calculations.SNR_dB.toFixed(1)} dB`, warn: calculations.SNR_dB < 12 },
          ].map((eq, i) => (
            <g key={i} transform={`translate(0, ${i * 18})`}>
              <text x="0" y="0" fill="#79c0ff" fontSize="10">{eq.label}</text>
              <text x="200" y="0" fill={eq.warn ? "#f85149" : "#3fb950"} fontSize="10" fontWeight="bold">{eq.value}</text>
            </g>
          ))}
        </g>
      </g>
    </svg>
  );

  const BOMView = () => {
    const components = [
      { name: 'Arduino Nano (3-pack)', price: 9.99, desc: 'ATmega328P MCU, 4µA sleep' },
      { name: 'Si5351A Clock Gen', price: 7.95, desc: '25kHz PLL, ±25ppm stability' },
      { name: 'IRFZ44N MOSFET (10-pack)', price: 6.99, desc: 'H-bridge, 17.5mΩ Rds(on)' },
      { name: 'TP4056 + 18650 Holder', price: 8.99, desc: 'Li-ion charger + protection' },
      { name: '18 AWG Magnet Wire (50ft)', price: 11.99, desc: 'TX coil - low resistance' },
      { name: '22 AWG Magnet Wire (100ft)', price: 8.99, desc: 'RX coil - sensitivity' },
      { name: 'PVC Pipe 30cm OD', price: 5.99, desc: 'Coil forms' },
      { name: 'Capacitor Kit (630pc)', price: 9.99, desc: 'LC tank resonance' },
      { name: 'Perfboard Kit', price: 7.99, desc: 'Assembly base' },
      { name: 'Resistor Kit', price: 8.98, desc: 'Gate drive, pull-downs' },
      { name: 'INA128 Inst Amp', price: 6.50, desc: 'Low-noise preamp' },
      { name: '18650 Battery (3500mAh)', price: 8.99, desc: 'Protected Li-ion cell' },
    ];
    const total = components.reduce((sum, c) => sum + c.price, 0);
    
    return (
      <svg viewBox="0 0 1000 600" className="w-full h-full">
        <rect x="0" y="0" width="1000" height="600" fill="#0a0e14" />
        <text x="500" y="35" textAnchor="middle" fill="#e6edf3" fontSize="20" fontWeight="bold">Bill of Materials</text>
        
        <g transform="translate(100, 60)">
          <rect x="0" y="0" width="800" height="500" fill="#161b22" stroke="#30363d" rx="4" />
          
          <g transform="translate(20, 20)">
            <text x="0" y="0" fill="#8b949e" fontSize="11" fontWeight="bold">COMPONENT</text>
            <text x="350" y="0" fill="#8b949e" fontSize="11" fontWeight="bold">FUNCTION</text>
            <text x="650" y="0" fill="#8b949e" fontSize="11" fontWeight="bold">PRICE</text>
            <line x1="0" y1="10" x2="760" y2="10" stroke="#30363d" strokeWidth="1" />
          </g>
          
          {components.map((item, i) => (
            <g key={i} transform={`translate(20, ${45 + i * 35})`}>
              <rect x="-10" y="-12" width="780" height="30" fill={i % 2 === 0 ? '#21262d' : 'transparent'} rx="2" />
              <text x="0" y="5" fill="#e6edf3" fontSize="11">{item.name}</text>
              <text x="350" y="5" fill="#8b949e" fontSize="10">{item.desc}</text>
              <text x="650" y="5" fill="#3fb950" fontSize="11" fontWeight="bold">${item.price.toFixed(2)}</text>
            </g>
          ))}
          
          <g transform="translate(20, 475)">
            <line x1="0" y1="-10" x2="760" y2="-10" stroke="#30363d" strokeWidth="2" />
            <text x="0" y="10" fill="#e6edf3" fontSize="14" fontWeight="bold">TOTAL</text>
            <text x="650" y="10" fill="#3fb950" fontSize="16" fontWeight="bold">${total.toFixed(2)}</text>
          </g>
        </g>
      </svg>
    );
  };

  const views = [
    { id: 'overview', label: 'System Overview' },
    { id: 'physics', label: 'EM Physics' },
    { id: 'bom', label: 'Bill of Materials' },
  ];

  const renderView = () => {
    switch (activeView) {
      case 'overview': return <SystemOverview />;
      case 'physics': return <PhysicsView />;
      case 'bom': return <BOMView />;
      default: return <SystemOverview />;
    }
  };

  return (
    <div className="app-container">
      <div className="nav-bar">
        {views.map((v) => (
          <button key={v.id} onClick={() => setActiveView(v.id)}
            className={`nav-btn ${activeView === v.id ? 'active' : ''}`}>
            {v.label}
          </button>
        ))}
        <div className="nav-divider" />
        <button onClick={() => setIsRunning(!isRunning)} className={`nav-btn ${isRunning ? 'running' : ''}`}>
          {isRunning ? '⏸ Pause' : '▶ Play'}
        </button>
      </div>
      
      <div className="main-view">{renderView()}</div>
      
      <div className="controls-bar">
        <div className="controls-row">
          <label>Freq: <input type="range" min="5000" max="50000" step="1000" value={frequency}
            onChange={(e) => setFrequency(Number(e.target.value))} />
            <span className="value">{(frequency/1000).toFixed(0)}kHz</span></label>
          <label>σ: <input type="range" min="0.05" max="2" step="0.05" value={muckConductivity}
            onChange={(e) => setMuckConductivity(Number(e.target.value))} />
            <span className="value">{muckConductivity.toFixed(2)}S/m</span></label>
          <label>Dist: <input type="range" min="0.5" max="3" step="0.1" value={distance}
            onChange={(e) => setDistance(Number(e.target.value))} />
            <span className="value">{distance.toFixed(1)}m</span></label>
          <label>I_tx: <input type="range" min="0.1" max="2.0" step="0.1" value={txPower}
            onChange={(e) => setTxPower(Number(e.target.value))} />
            <span className="value">{txPower.toFixed(1)}A</span></label>
        </div>
        <div className="controls-row">
          <label>TX⌀: <input type="range" min="10" max="50" step="5" value={txLoopDiameter}
            onChange={(e) => setTxLoopDiameter(Number(e.target.value))} />
            <span className="value">{txLoopDiameter}cm</span></label>
          <label>TX N: <input type="range" min="5" max="40" step="1" value={txTurns}
            onChange={(e) => setTxTurns(Number(e.target.value))} />
            <span className="value">{txTurns}T</span></label>
          <label>RX⌀: <input type="range" min="10" max="60" step="5" value={rxLoopDiameter}
            onChange={(e) => setRxLoopDiameter(Number(e.target.value))} />
            <span className="value">{rxLoopDiameter}cm</span></label>
          <label>RX N: <input type="range" min="10" max="60" step="1" value={rxTurns}
            onChange={(e) => setRxTurns(Number(e.target.value))} />
            <span className="value">{rxTurns}T</span></label>
          <label>AWG: <select value={wireGauge} onChange={(e) => setWireGauge(Number(e.target.value))}>
            <option value={14}>14</option><option value={16}>16</option><option value={18}>18</option>
            <option value={20}>20</option><option value={22}>22</option>
          </select></label>
        </div>
        <div className="status-row">
          <span>TX: {calculations.txL.toFixed(1)}µH Q={calculations.txQ.toFixed(0)}</span>
          <span>RX: {calculations.rxL.toFixed(1)}µH Q={calculations.rxQ.toFixed(0)}</span>
          <span>V_ind: {calculations.V_induced.toFixed(1)}µV</span>
          <span>V_res: {calculations.V_after_resonance.toFixed(2)}mV</span>
          <span className={calculations.SNR_dB > 12 ? "good" : "bad"}>SNR: {calculations.SNR_dB.toFixed(1)}dB</span>
          <span className={calculations.linkMargin > 0 ? "good" : "bad"}>Margin: {calculations.linkMargin.toFixed(1)}dB</span>
        </div>
        {calculations.SNR_dB < 12 && (
          <div className="warning">⚠️ SNR {calculations.SNR_dB.toFixed(1)}dB &lt; 12dB - LINK WILL FAIL</div>
        )}
        {calculations.SNR_dB >= 12 && calculations.SNR_dB < 20 && (
          <div className="caution">⚠️ Marginal link ({calculations.linkMargin.toFixed(1)}dB margin)</div>
        )}
        {calculations.SNR_dB >= 20 && (
          <div className="success">✓ SOLID LINK - {calculations.linkMargin.toFixed(1)}dB margin</div>
        )}
      </div>
    </div>
  );
};

export default TBMMISimulation;
