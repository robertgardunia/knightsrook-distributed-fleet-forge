import { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { io } from 'socket.io-client';
import type { FleetGraph, FleetNode } from '../types/fleet';

const socket = io();

export default function FleetGraph() {
  const [graph, setGraph] = useState<FleetGraph>({ nodes: [], links: [] });
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    socket.on('fleet:graph', setGraph);
    return () => { socket.off('fleet:graph', setGraph); };
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <ForceGraph2D
        graphData={graph}
        width={dimensions.width}
        height={dimensions.height}
        nodeVal={(node) => (node as unknown as FleetNode).val}
        nodeColor={(node) => (node as unknown as FleetNode).color}
        nodeLabel={(node) => {
          const n = node as unknown as FleetNode;
          return `${n.name} · ${n.role} · ${n.status}`;
        }}
        linkColor={() => '#ffffff18'}
        backgroundColor="#0f172a"
        nodeCanvasObject={(node, ctx, globalScale) => {
          const n = node as unknown as FleetNode & { x: number; y: number };
          const radius = Math.sqrt(n.val) * 3;

          ctx.beginPath();
          ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
          ctx.fillStyle = n.color + 'cc';
          ctx.fill();
          ctx.strokeStyle = n.color;
          ctx.lineWidth = 1.5 / globalScale;
          ctx.stroke();

          if (globalScale > 1.2 || n.role === 'homebase' || n.role === 'station-controller') {
            const fontSize = Math.max(6, 10 / globalScale);
            ctx.font = `${fontSize}px monospace`;
            ctx.fillStyle = '#f1f5f9';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(n.name, n.x, n.y);
          }
        }}
        nodeCanvasObjectMode={() => 'replace'}
      />
    </div>
  );
}
