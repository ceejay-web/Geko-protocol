
import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CrosshairMode, IPriceLine, ColorType, CandlestickSeries, HistogramSeries, LineSeries } from 'lightweight-charts';
import { MarketData, ActiveTrade } from '../types';

interface MarketChartProps {
  data: MarketData[];
  symbol: string;
  activeTrade?: ActiveTrade | null;
  onUpdateTrade?: (id: string, updates: Partial<ActiveTrade>) => void;
  showVolume?: boolean;
  showIndicators?: boolean;
}

interface ManagedLine {
    priceLine: IPriceLine;
    price: number;
    type: 'stop-loss' | 'take-profit' | 'entry';
    onDragEnd?: (price: number) => void;
}

// Technical Analysis Helpers
const calculateEMA = (data: MarketData[], period: number) => {
  const k = 2 / (period + 1);
  let emaArray = [];
  let previousEma = data[0].close;

  for (let i = 0; i < data.length; i++) {
    if (i === 0) {
      emaArray.push({ time: data[i].time, value: data[i].close });
      continue;
    }
    const currentPrice = data[i].close;
    const ema = currentPrice * k + previousEma * (1 - k);
    emaArray.push({ time: data[i].time, value: ema });
    previousEma = ema;
  }
  return emaArray;
};

const calculateRSI = (data: MarketData[], period: number = 14) => {
  if (data.length < period) return 50;
  
  let gains = 0;
  let losses = 0;

  for (let i = data.length - period; i < data.length; i++) {
    const change = data[i].close - data[i - 1].close;
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }

  const avgGain = gains / period;
  const avgLoss = losses / period;
  
  if (avgLoss === 0) return 100;
  
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
};

const MarketChart: React.FC<MarketChartProps> = ({ data, symbol, activeTrade, onUpdateTrade, showVolume = true, showIndicators = true }) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  
  // Series Refs
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ema20SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  
  // Managed Lines for Interaction
  const linesRef = useRef<ManagedLine[]>([]);
  const isDraggingRef = useRef<ManagedLine | null>(null);

  const [legendData, setLegendData] = useState<any>(null);
  const [rsiValue, setRsiValue] = useState<number>(0);

  // 1. Initialize Chart Instance
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#181C25' }, // Dark Chart BG
        textColor: '#848E9C', // Muted Text
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 10,
      },
      grid: {
        vertLines: { color: '#2B3139', style: 2 },
        horzLines: { color: '#2B3139', style: 2 },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        borderColor: '#2B3139',
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: '#2B3139',
        scaleMargins: {
          top: 0.2, // Leave space for candles
          bottom: showVolume ? 0.2 : 0.05, // Leave space for volume if enabled
        },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: '#5E6673',
          width: 1,
          style: 3,
          labelBackgroundColor: '#181C25',
        },
        horzLine: {
          color: '#5E6673',
          width: 1,
          style: 3,
          labelBackgroundColor: '#181C25',
        },
      },
      handleScale: {
          axisPressedMouseMove: true,
          mouseWheel: true,
          pinch: true,
      },
      handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
      }
    });

    // Create Series
    if (showVolume) {
        const volumeSeries = chart.addSeries(HistogramSeries, {
            priceFormat: { type: 'volume' },
            priceScaleId: '', 
        });
        volumeSeries.priceScale().applyOptions({
            scaleMargins: { top: 0.85, bottom: 0 },
        });
        volumeSeriesRef.current = volumeSeries;
    } else {
        volumeSeriesRef.current = null;
    }

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981', // emerald-500
      downColor: '#ef4444', // rose-500
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    const ema20Series = chart.addSeries(LineSeries, {
      color: '#3b82f6', // blue-500
      lineWidth: 1,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      title: 'EMA 20',
      visible: showIndicators,
    });

    const ema50Series = chart.addSeries(LineSeries, {
      color: '#f97316', // orange-500
      lineWidth: 1,
      crosshairMarkerVisible: false,
      priceLineVisible: false,
      title: 'EMA 50',
      visible: showIndicators,
    });

    // Store refs
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    ema20SeriesRef.current = ema20Series;
    ema50SeriesRef.current = ema50Series;

    // Crosshair Handler
    chart.subscribeCrosshairMove((param) => {
      if (param.time) {
        const price = param.seriesData.get(candleSeries) as any;
        const volume = (showVolume && volumeSeriesRef.current) ? param.seriesData.get(volumeSeriesRef.current) as any : undefined;
        if (price) {
          setLegendData({
            open: price.open,
            high: price.high,
            low: price.low,
            close: price.close,
            volume: volume ? volume.value : 0,
            change: ((price.close - price.open) / price.open) * 100
          });
        }
      }
    });

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
    };
  }, [showVolume]);

  useEffect(() => {
    if (ema20SeriesRef.current) ema20SeriesRef.current.applyOptions({ visible: showIndicators });
    if (ema50SeriesRef.current) ema50SeriesRef.current.applyOptions({ visible: showIndicators });
  }, [showIndicators]);

  useEffect(() => {
    if (!chartRef.current || data.length === 0) return;

    const ema20Data = calculateEMA(data, 20);
    const ema50Data = calculateEMA(data, 50);
    const currentRSI = calculateRSI(data);
    setRsiValue(currentRSI);

    const formattedData = data.map(d => ({
      time: d.time as any,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    })).sort((a, b) => (a.time as number) - (b.time as number));

    candleSeriesRef.current?.setData(formattedData);
    ema20SeriesRef.current?.setData(ema20Data as any);
    ema50SeriesRef.current?.setData(ema50Data as any);

    if (showVolume && volumeSeriesRef.current) {
        const volumeData = data.map(d => ({
            time: d.time as any,
            value: d.volume,
            color: d.close >= d.open ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
        }));
        volumeSeriesRef.current.setData(volumeData);
    }

    const last = data[data.length - 1];
    setLegendData({
      open: last.open,
      high: last.high,
      low: last.low,
      close: last.close,
      volume: showVolume ? last.volume : 0,
      change: ((last.close - last.open) / last.open) * 100
    });

  }, [data, showVolume]);

  useEffect(() => {
    if (!candleSeriesRef.current) return;
    linesRef.current.forEach(l => candleSeriesRef.current?.removePriceLine(l.priceLine));
    linesRef.current = [];

    if (activeTrade) {
        const createLine = (price: number, type: 'stop-loss' | 'take-profit' | 'entry', color: string, editable: boolean) => {
             const labels: Record<string, string> = { 'stop-loss': 'STOP LOSS', 'take-profit': 'TAKE PROFIT', 'entry': 'ENTRY' };
             const line = candleSeriesRef.current!.createPriceLine({
                price: price,
                color: color,
                lineWidth: 2,
                lineStyle: type === 'entry' ? 0 : 2,
                axisLabelVisible: true,
                title: labels[type],
             });
             
             linesRef.current.push({
                 priceLine: line,
                 price: price,
                 type: type,
                 onDragEnd: editable ? (newPrice) => {
                    if (onUpdateTrade && activeTrade) {
                        onUpdateTrade(activeTrade.id, { [type === 'stop-loss' ? 'stopLoss' : 'takeProfit']: newPrice });
                    }
                 } : undefined
             });
        };

        const isLong = activeTrade.direction === 'up';
        const entryPrice = activeTrade.entryPrice;
        
        const tpPrice = activeTrade.takeProfit || (isLong ? entryPrice * 1.04 : entryPrice * 0.96);

        // Entry and Stop Loss marks removed as per user request.
        createLine(tpPrice, 'take-profit', '#10b981', true);
    }
  }, [activeTrade]);

  useEffect(() => {
     const container = chartContainerRef.current;
     if (!container) return;

     const handleMouseDown = (e: MouseEvent) => {
         if (!candleSeriesRef.current || linesRef.current.length === 0) return;
         
         const rect = container.getBoundingClientRect();
         const y = e.clientY - rect.top;
         
         let closest: ManagedLine | null = null;
         let minDist = 12;

         linesRef.current.forEach(lineObj => {
             if (!lineObj.onDragEnd) return;
             
             // @ts-ignore
             const coord = candleSeriesRef.current?.priceToCoordinate(lineObj.price);
             if (coord !== null && coord !== undefined && Math.abs(coord - y) < minDist) {
                 closest = lineObj;
                 minDist = Math.abs(coord - y);
             }
         });

         if (closest) {
             isDraggingRef.current = closest;
             container.style.cursor = 'grabbing';
             chartRef.current?.applyOptions({
                 handleScroll: false,
                 handleScale: false
             });
         }
     };

     const handleMouseMove = (e: MouseEvent) => {
         if (!candleSeriesRef.current) return;
         const rect = container.getBoundingClientRect();
         const y = e.clientY - rect.top;

         if (isDraggingRef.current) {
             // @ts-ignore
             const newPrice = candleSeriesRef.current.coordinateToPrice(y);
             if (newPrice !== null) {
                 isDraggingRef.current.price = newPrice;
                 isDraggingRef.current.priceLine.applyOptions({ price: newPrice });
             }
         } else {
             let hovering = false;
             linesRef.current.forEach(lineObj => {
                 if (!lineObj.onDragEnd) return;
                 // @ts-ignore
                 const coord = candleSeriesRef.current?.priceToCoordinate(lineObj.price);
                 if (coord !== null && coord !== undefined && Math.abs(coord - y) < 12) {
                     hovering = true;
                 }
             });
             container.style.cursor = hovering ? 'grab' : 'crosshair';
         }
     };

     const handleMouseUp = () => {
         if (isDraggingRef.current) {
             isDraggingRef.current.onDragEnd?.(isDraggingRef.current.price);
             isDraggingRef.current = null;
             
             chartRef.current?.applyOptions({
                 handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: true },
                 handleScale: { axisPressedMouseMove: true, mouseWheel: true, pinch: true }
             });
             
             container.style.cursor = 'grab';
         }
     };
     
     container.addEventListener('mousedown', handleMouseDown);
     container.addEventListener('mousemove', handleMouseMove);
     container.addEventListener('mouseup', handleMouseUp);
     container.addEventListener('mouseleave', handleMouseUp);

     return () => {
         container.removeEventListener('mousedown', handleMouseDown);
         container.removeEventListener('mousemove', handleMouseMove);
         container.removeEventListener('mouseup', handleMouseUp);
         container.removeEventListener('mouseleave', handleMouseUp);
     };
  }, []);

  return (
    <div className="w-full h-full relative group bg-[#181C25]">
      <div ref={chartContainerRef} className="w-full h-full" />
      
      {legendData && (
        <div className="absolute top-3 left-3 bg-[#1E2329]/90 backdrop-blur-sm border border-[#2B3139] p-3 rounded-lg pointer-events-none select-none z-10 flex flex-col space-y-2 shadow-lg">
          <div className="flex items-center space-x-2">
            <span className="text-gray-100 font-black text-xs">{symbol}</span>
            <span className="text-[10px] text-gray-500 font-mono">15m</span>
            <div className={`text-[10px] font-bold px-1.5 rounded ${legendData.change >= 0 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-rose-500/20 text-rose-400'}`}>
              {legendData.change >= 0 ? '+' : ''}{legendData.change.toFixed(2)}%
            </div>
          </div>
          
          <div className="grid grid-cols-4 gap-x-4 gap-y-1 text-[10px] font-mono">
            <div className="flex flex-col">
              <span className="text-gray-500">O</span>
              <span className={legendData.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{legendData.open.toFixed(2)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-500">H</span>
              <span className={legendData.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{legendData.high.toFixed(2)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-500">L</span>
              <span className={legendData.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{legendData.low.toFixed(2)}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-gray-500">C</span>
              <span className={legendData.change >= 0 ? 'text-emerald-400' : 'text-rose-400'}>{legendData.close.toFixed(2)}</span>
            </div>
          </div>

          <div className="h-px bg-[#2B3139] my-1"></div>

          <div className="flex space-x-4 text-[9px] font-mono">
             {showVolume && (
                 <div>
                    <span className="text-gray-500 mr-1">Vol</span>
                    <span className="text-amber-500 font-bold">{legendData.volume.toLocaleString()}</span>
                 </div>
             )}
             {showIndicators && (
                 <>
                     <div>
                        <span className="text-blue-400 font-bold mr-1">EMA20</span>
                        <span className="text-gray-400">{(legendData.close * 0.998).toFixed(2)}</span>
                     </div>
                     <div>
                        <span className="text-orange-400 font-bold mr-1">EMA50</span>
                        <span className="text-gray-400">{(legendData.close * 0.985).toFixed(2)}</span>
                     </div>
                 </>
             )}
          </div>
        </div>
      )}

      {showIndicators && (
          <div className="absolute top-3 right-3 flex space-x-2">
             <div className="bg-[#1E2329]/90 backdrop-blur-sm border border-[#2B3139] px-3 py-1.5 rounded-lg flex items-center space-x-2 shadow-sm">
                <span className="text-[9px] font-black text-gray-500 uppercase">RSI (14)</span>
                <span className={`text-[10px] font-mono font-bold ${rsiValue > 70 ? 'text-rose-400' : rsiValue < 30 ? 'text-emerald-400' : 'text-indigo-400'}`}>
                  {rsiValue.toFixed(2)}
                </span>
             </div>
          </div>
      )}
    </div>
  );
};

export default MarketChart;
