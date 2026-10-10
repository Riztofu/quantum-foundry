import { Bench } from "./components/Bench";
import { MapScreen } from "./components/MapScreen";
import { Workshop } from "./components/Workshop";
import { useApp } from "./state/store";

export default function App(): JSX.Element {
  const app = useApp();
  if (app.screen === "bench" && app.levelId) return <Bench />;
  if (app.screen === "workshop") return <Workshop />;
  return <MapScreen />;
}
