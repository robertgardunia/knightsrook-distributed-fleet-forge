import { useEffect, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import type { FleetGraph, FleetNode } from '../types/fleet';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FGInstance = any;

interface Props {
  graph: FleetGraph;
  onNodeSelect: (node: FleetNode | null) => void;
  selectedNodeId?: string;
}

export default function FleetGraph({ graph, onNodeSelect, selectedNodeId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<FGInstance>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect;
      setDimensions({ width, height });
      fgRef.current?.zoomToFit(200, 40);
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => { document.body.style.cursor = 'default'; };
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%' }}>
      <ForceGraph2D
        ref={fgRef}
        graphData={graph}
        warmupTicks={200}
        cooldownTime={2000}
        onEngineStop={() => fgRef.current?.zoomToFit(400, 40)}
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
        onNodeClick={(node) => onNodeSelect(node as unknown as FleetNode)}
        onNodeHover={(node) => { document.body.style.cursor = node ? 'pointer' : 'default'; }}
        onBackgroundClick={() => onNodeSelect(null)}
        nodeCanvasObject={(node, ctx, globalScale) => {
          const n = node as unknown as FleetNode & { x: number; y: number };
          const isSelected = n.id === selectedNodeId;
          const radius = Math.sqrt(n.val) * 3;

          if (isSelected) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, radius + 5 / globalScale, 0, 2 * Math.PI);
            ctx.strokeStyle = '#ffffff55';
            ctx.lineWidth = 2 / globalScale;
            ctx.stroke();
          }

          ctx.beginPath();
          ctx.arc(n.x, n.y, radius, 0, 2 * Math.PI);
          ctx.fillStyle = n.color + 'cc';
          ctx.fill();
          ctx.strokeStyle = isSelected ? '#ffffff' : n.color;
          ctx.lineWidth = (isSelected ? 2 : 1.5) / globalScale;
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
