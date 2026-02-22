import React, { useEffect, useRef } from 'react';

interface MarketChartProps {
  data: any[];
  symbol: string;
  showVolume?: boolean;
}

declare global {
  interface Window {
    TradingView: any;
  }
}

const MarketChart: React.FC<MarketChartProps> = ({ symbol }) => {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scriptId = 'tradingview-widget-script';
    let script = document.getElementById(scriptId) as HTMLScriptElement;
    
    const initWidget = () => {
      if (container.current && window.TradingView) {
        // Clear container before re-initializing
        container.current.innerHTML = '';
        const widgetContainer = document.createElement('div');
        widgetContainer.id = `tradingview_widget_${symbol}`;
        widgetContainer.style.height = '100%';
        widgetContainer.style.width = '100%';
        container.current.appendChild(widgetContainer);

        new window.TradingView.widget({
          "autosize": true,
          "symbol": `BINANCE:${symbol}USDT`,
          "interval": "D",
          "timezone": "Etc/UTC",
          "theme": "dark",
          "style": "1",
          "locale": "en",
          "toolbar_bg": "#f1f3f6",
          "enable_publishing": false,
          "hide_side_toolbar": false,
          "allow_symbol_change": true,
          "container_id": widgetContainer.id,
          "backgroundColor": "#181C25",
          "gridColor": "rgba(43, 49, 57, 0.1)",
        });
      }
    };

    if (!script) {
      script = document.createElement("script");
      script.id = scriptId;
      script.src = "https://s3.tradingview.com/tv.js";
      script.type = "text/javascript";
      script.async = true;
      script.onload = initWidget;
      document.head.appendChild(script);
    } else {
      // Small timeout to ensure script is fully ready if it was already injected
      setTimeout(initWidget, 100);
    }
  }, [symbol]);

  return (
    <div ref={container} className="w-full h-full border border-[#2B3139] rounded-2xl overflow-hidden bg-[#181C25]" />
  );
};

export default MarketChart;