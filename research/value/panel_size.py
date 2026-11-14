"""Size prospective evidence without generating seeds or launching worlds."""

import json
import math
import sys
from pathlib import Path
from scipy.stats import chi2, norm

ROOT=Path(__file__).resolve().parents[2]


def required_pairs(sd, development_pairs, alpha, gain=1500, power=.8, qualification=.95):
    if development_pairs<2 or sd<0 or not 0<alpha<.5 or not 0<power<1 or not 0<qualification<1 or gain<=0:
        raise ValueError("Invalid design inputs")
    upper_sd=sd*math.sqrt((development_pairs-1)/chi2.ppf(.05,development_pairs-1))
    profit=math.ceil(((norm.ppf(1-alpha)+norm.ppf(power))*upper_sd/gain)**2)
    reliability=math.ceil(math.log(alpha)/math.log(qualification))
    return {"minimumUniquePairs":24,"profitPairsNormalApproximation":profit,"zeroFailureReliabilityPairs":reliability,"requiredPairs":max(24,profit,reliability),"standardDeviationEuros":sd,"oneSided95UpperSdEuros":upper_sd,"meaningfulGainEuros":gain,"profitTestPower":power,"claimAlpha":alpha,"qualificationLowerBoundTarget":qualification}


def main():
    integrity=json.loads((ROOT/"experiments/search-integrity.json").read_text())
    look=len(integrity["futureValidation"]["looks"])+1
    alpha=.05/(2*look*(look+1))
    report=json.loads((ROOT/(sys.argv[1] if len(sys.argv)>1 else "docs/value-development-v2-results.json")).read_text())
    if not report["terminal"]:
        raise ValueError("Wait for every frozen development trial")
    candidates={arm:required_pairs(row["versusMechanisms"]["standardDeviationEuros"],row["weeks"],alpha) for arm,row in report["summary"]["8"].items() if arm not in ["benchmark","mechanisms"]}
    output={"role":"prospective sizing only; no finalist, seeds, allocation or worlds created by this script","nextLook":look,"designs":candidates,"zeroFailurePairsFor99PercentWeeklyQualification":math.ceil(math.log(alpha)/math.log(.99)),"limitations":["Variance upper bound assumes independent normally distributed paired differences; four development weeks provide a poor variance estimate.","Power calculation approximates the positive-mean test, not the separate point-estimate>=1500 gate.","The qualification bound assumes IID weeks and zero observed failures; dependencies or mixed levels require a different design.","Freeze one finalist and its entire evaluation procedure before drawing a cryptographically random panel disjoint from all played/reserved seeds. Record alpha allocation and fixed sample size before play.","The24-pair floor is not enough to certify95% weekly qualification at the first allocated alpha, even with no failures."]}
    (ROOT/"docs/value-validation-sizing.json").write_text(json.dumps(output,indent=2)+"\n")
    print(json.dumps(output,indent=2))


if __name__=="__main__":
    main()
