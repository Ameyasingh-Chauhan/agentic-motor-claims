// Register only the ECharts modules we use (tree-shaken). Add modules here as charts need them.
import * as echarts from "echarts/core";
import { LineChart, BarChart, PieChart, GaugeChart, ScatterChart, GraphChart } from "echarts/charts";
import {
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  MarkLineComponent,
  MarkAreaComponent,
  AriaComponent,
  TitleComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";

echarts.use([
  LineChart,
  BarChart,
  PieChart,
  GaugeChart,
  ScatterChart,
  GraphChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DatasetComponent,
  MarkLineComponent,
  MarkAreaComponent,
  AriaComponent,
  TitleComponent,
  CanvasRenderer,
]);

export { echarts };
