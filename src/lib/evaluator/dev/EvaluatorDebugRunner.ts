import { createInitialHumanState }
from "../transition/HumanStateFactory";

import { generateTransitions }
from "../transition/TransitionGenerator";

export function runEvaluatorDebug() {
  const initial =
    createInitialHumanState();

  const transitions =
    generateTransitions(
      initial,
      ["R", "U", "R'", "U'"]
    );

  console.log(
    JSON.stringify(
      transitions,
      null,
      2
    )
  );
}