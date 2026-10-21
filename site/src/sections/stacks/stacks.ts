import { ANGULAR } from "./data/angular";
import { DOTNET } from "./data/dotnet";
import { GO } from "./data/go";
import { JAVA } from "./data/java";
import { NODE } from "./data/node";
import { PYTHON } from "./data/python";
import { REACT } from "./data/react";
import { SVELTE } from "./data/svelte";
import { VUE } from "./data/vue";

// Every stack page, in the order the menus list them: add-ons first, then browser frameworks, then OpenTelemetry SDKs.
export const STACK_LIST = [DOTNET, NODE, REACT, VUE, ANGULAR, SVELTE, JAVA, PYTHON, GO];
