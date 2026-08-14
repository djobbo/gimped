import { Runtime } from "foldkit";
import { ClientApiLive } from "./client-api-live.ts";
import { Message, Model, init, subscriptions, update, view } from "./main.ts";
import "./styles.css";

const application = Runtime.makeApplication({
  Model,
  init,
  update,
  view,
  subscriptions,
  resources: ClientApiLive,
  container: document.getElementById("root"),
  devTools: {
    Message,
  },
});

Runtime.run(application);
