import { Handle, Position, type NodeProps } from 'reactflow';
import type { Node } from '@/api/client';
import { useState, useEffect } from 'react';

// Helper function to recolor SVG fills and strokes with the blueprint color
const recolorSvg = (svgString: string, color: string | undefined): string => {
  if (!color || !svgString) return svgString;

  let recolored = svgString;

  // Replace any fill or stroke attributes with the theme color,
  // but preserve fill/stroke="none" or "transparent"
  recolored = recolored
    .replace(/fill="([^"]*)"/gi, (_match, value) => {
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'none' || normalized === 'transparent') {
        return `fill="${value}"`;
      }
      return `fill="${color}"`;
    })
    .replace(/fill='([^']*)'/gi, (_match, value) => {
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'none' || normalized === 'transparent') {
        return `fill='${value}'`;
      }
      return `fill='${color}'`;
    })
    .replace(/stroke="([^"]*)"/gi, (_match, value) => {
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'none' || normalized === 'transparent') {
        return `stroke="${value}"`;
      }
      return `stroke="${color}"`;
    })
    .replace(/stroke='([^']*)'/gi, (_match, value) => {
      const normalized = String(value).trim().toLowerCase();
      if (normalized === 'none' || normalized === 'transparent') {
        return `stroke='${value}'`;
      }
      return `stroke='${color}'`;
    });

  // Replace inline style fill/stroke declarations with the theme color
  // while preserving fill/stroke:none or transparent
  recolored = recolored.replace(/style="([^"]*)"/g, (_match, styleContent) => {
    let updatedStyle = String(styleContent)
      .replace(/fill:\s*[^;]+/gi, (fillMatch) => {
        const value = fillMatch.split(':')[1]?.trim().toLowerCase();
        if (value === 'none' || value === 'transparent') {
          return fillMatch;
        }
        return `fill:${color}`;
      })
      .replace(/stroke:\s*[^;]+/gi, (strokeMatch) => {
        const value = strokeMatch.split(':')[1]?.trim().toLowerCase();
        if (value === 'none' || value === 'transparent') {
          return strokeMatch;
        }
        return `stroke:${color}`;
      });
    return `style="${updatedStyle}"`;
  });

  return recolored;
};

interface ExtendedNode extends Node {
  indicator_id?: string | number;
  indicator_set?: string | number;
  statusIndicatorSvg?: string;
  statusText?: string;
}

interface CustomNodeData {
  label: string;
  nodeData: ExtendedNode;
}

export default function CustomNode({ data, selected }: NodeProps<CustomNodeData>) {
  const { label, nodeData } = data;
  const nodeType = nodeData.type || 'node';
  const inputs = (nodeData.properties?.inputs || []) as Array<{name?: string}>;
  const outputs = (nodeData.properties?.outputs || []) as Array<{name?: string}>;
  const [textColor, setTextColor] = useState<string | undefined>(undefined);
  const [textStyle, setTextStyle] = useState<string | undefined>(undefined);
  const [indicatorColor, setIndicatorColor] = useState<string | undefined>(undefined);
  
  // Debug log for indicator rendering
  if (nodeData) {
    console.log('[CustomNode] Render', nodeData.id, 'indicator_id:', nodeData.indicator_id, 'indicator_set:', nodeData.indicator_set, 'status:', nodeData.properties?.status, 'SVG:', nodeData.statusIndicatorSvg ? nodeData.statusIndicatorSvg.slice(0, 40) + '...' : null, 'Text:', nodeData.statusText);
  }

  // Fetch theme styling
  useEffect(() => {
    if (nodeData.indicator_id && nodeData.indicator_set) {
      const indicatorSet = nodeData.indicator_set;
      const indicatorId = nodeData.indicator_id;
      fetch(`http://localhost:5000/api/v1/indicators/${indicatorSet}/${indicatorId}/theme`)
        .then(res => res.json())
        .then(theme => {
          if (theme) {
            setTextColor(theme.text_color);
            setTextStyle(theme.text_style);
            setIndicatorColor(theme.indicator_color);
          }
        })
        .catch(err => console.warn('Failed to fetch theme:', err));
    }
  }, [nodeData.indicator_id, nodeData.indicator_set]);

  // Get color based on node type
  const getNodeColor = (type: string) => {
    const colors: Record<string, string> = {
      input: '#457b9d',
      output: '#1d3557',
      processing: '#e63946',
      logic: '#f1faee',
      default: '#a8dadc',
    };
    return colors[type] || colors.default;
  };

  const bgColor = getNodeColor(nodeType);

  return (
    <div
      className={`custom-node ${selected ? 'selected' : ''}`}
      style={{
        background: bgColor,
        border: selected ? '2px solid #e63946' : '2px solid #a8dadc',
        borderRadius: '8px',
        padding: '12px 8px',
        minWidth: '100px',
        color: '#f1faee',
        boxShadow: selected ? '0 0 8px rgba(230, 57, 70, 0.5)' : 'none',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Input handles */}
      {inputs.map((input, idx: number) => (
        <Handle
          key={`input-${idx}`}
          type="target"
          position={Position.Left}
          id={`input-${input.name || idx}`}
          style={{
            top: `${25 + idx * 25}px`,
            background: '#a8dadc',
          }}
          title={input.name || `Input ${idx}`}
        />
      ))}

      {/* Status Indicator */}
      {nodeData.statusIndicatorSvg ? (
        <span
          className="status-indicator-svg"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{ __html: recolorSvg(nodeData.statusIndicatorSvg, indicatorColor) }}
        />
      ) : nodeData.statusText ? (
        <span className="status-indicator-text text-xs opacity-80">{nodeData.statusText}</span>
      ) : null}

      {/* Node content */}
      <div className="flex flex-col items-center gap-1">
        <div 
          className="text-xs font-semibold text-center truncate w-full"
          style={{
            color: textColor,
            fontWeight: textStyle === 'bold' ? 'bold' : 'semibold',
            textDecoration: textStyle === 'strikethrough' ? 'line-through' : 'none',
          }}
        >
          {label}
        </div>
        <div className="text-[10px] opacity-75">{nodeType}</div>
      </div>

      {/* Output handles */}
      {outputs.map((output, idx: number) => (
        <Handle
          key={`output-${idx}`}
          type="source"
          position={Position.Right}
          id={`output-${output.name || idx}`}
          style={{
            top: `${25 + idx * 25}px`,
            background: '#a8dadc',
          }}
          title={output.name || `Output ${idx}`}
        />
      ))}
    </div>
  );
}
