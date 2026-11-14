**The most promising change is to make customer pricing, accepting work, forming routes, and paying drivers parts of one planning system.** Each decision changes the economics of the others.

The strongest evidence is the lower-level result. Changing acceptance economics increased development profit from roughly €900 to €6,300–€7,000 per week. But broader acceptance combined with cheap payments performed badly under scarce supply. That suggests the dispatcher needs to understand **when additional work is valuable and when it overloads the system**. Those gains came from only three underlying seed blocks, so their generality remains uncertain. [Recorded findings](/Users/yerzham/Documents/ChatGPT/BAHN/docs/first-round-findings-and-research-plan.md)

I see five promising architectural changes.

1. **Give available capacity an economic value**

   Today, much of admission depends on rules about outstanding work. A stronger system would estimate the value of available driver time in each location and period.

   Consider a hypothetical order with €30 revenue left after its expected fulfillment costs. If accepting it consumes scarce capacity that could earn €50 elsewhere, accepting it reduces expected weekly profit. During a quiet period, the same order might be attractive.

   This produces a *capacity price*, also called an opportunity cost. Customer quotes and acceptance decisions would respond to that price. Difficult destinations, tight deadlines, and many unbooked commitments would generally make capacity more expensive.

   **Why it could help:** it could admit substantial volume in abundant conditions while protecting the dispatcher during shortages. The difficult research question is estimating that value accurately enough to improve decisions.

2. **Build potential routes before deciding which work to acquire**

   The dispatcher could evaluate a new request as part of several possible plans.

   For example, an existing order takes a driver from A to B. A new request from B toward A might make the overall route attractive even if that request looks mediocre by itself. The planner would estimate the *additional* cost of adding it, then use that information when quoting.

   Crucially, it must evaluate what happens if the customer declines, the existing job books before the new quote resolves, or no driver accepts the combined route. Savings should receive credit in proportion to their likelihood.

   **NetworkX fits the pair-selection part well.** Represent compatible jobs as connected nodes, weight each connection by expected incremental savings, and choose non-overlapping pairs with maximum total weight. Larger overlapping route candidates require a richer formulation, such as selecting routes with integer constraints using OR-Tools. Neither solver supplies the missing economics automatically. [NetworkX matching](https://networkx.org/documentation/stable/reference/algorithms/generated/networkx.algorithms.matching.max_weight_matching.html), [OR-Tools CP-SAT](https://developers.google.com/optimization/cp/cp_solver)

   The newer research already tests pairing new requests with already-won orders. A broader departure would compare an entire portfolio of feasible routes and customer offers together. [Current research notes](/Users/yerzham/Documents/ChatGPT/BAHN/docs/value-research.md)

3. **Optimize the customer side and driver side together**

   For each possible customer quote, the planner should consider several driver-payment strategies and their consequences.

   Suppose paying €8 more is estimated to reduce expected refunds and emergency rescue costs by €12. That increase has positive expected value. Conversely, if booking is already likely and the deadline is comfortable, additional pay may buy little.

   This requires models of booking delay, drops, and delivery risk conditional on payment, route, eligibility, and current supply. Drivers remain independent decision-makers, so a visible eligible driver cannot be treated as guaranteed capacity.

   The existing booking models show useful predictive improvements, but historical correlations do not establish how drivers would respond to different payments. Small randomized payment experiments are needed to learn that response. [Booking-model findings](/Users/yerzham/Documents/ChatGPT/BAHN/docs/value-research.md)

4. **Plan across several plausible futures, then execute one step**

   This would combine the previous components into a **rolling-horizon planner**.

   Each time a meaningful event arrives, it would compare alternative actions across plausible scenarios involving customer wins, driver bookings, delays, and future demand. It would execute the next action, observe the outcome, and calculate again.

   ```mermaid
   flowchart LR
       O[Observe requests and supply] --> B[Update market estimates]
       B --> P[Compare prices, routes and payments]
       P --> A[Execute next action]
       A --> O
   ```

   Its score would approximately be

   \[
   \text{expected immediate net profit}
   + \text{change in future earning potential}.
   \]

   Future earning potential includes both capacity consumed and useful driver positioning. Those effects must be accounted for consistently to avoid counting the same benefit twice.

   Qualification risk would also constrain the plan. A route that looks profitable on average could be rejected if plausible delays would endanger existing commitments. Joint pricing and routing with opportunity costs has a research precedent, although that does not establish performance in Spread. [Related research](https://arxiv.org/abs/1912.02946)

5. **Learn the value of future states**

   A further departure would train a model to estimate how valuable the resulting situation is—given remaining time, available supply, outstanding commitments, geography, and deadline pressure.

   That lets the planner recognize benefits that simple rules miss, such as accepting work that improves the location of supply for later demand.

   I would initially use this model inside an explicit planner, with inspectable constraints and bounded actions. End-to-end reinforcement learning could become a candidate once there is sufficient diverse experience and a trustworthy training environment. The present evidence is too limited to assume it would outperform simpler architectures.

**My preferred research sequence would be capacity valuation, route portfolios, and payment-response learning, followed by their integration into rolling-horizon planning.** Each component should also be tested separately so that an improvement or failure can be explained.

The current records have not established a replacement winner. Earlier joint-planning and routing implementations lost money, so a new version needs a specific mechanism explaining why it should perform differently. Promotion should depend on whole-week profit and qualification on untouched paired weeks, with the documented 24-pair minimum increased when uncertainty requires it. A better optimization score or a more accurate prediction is useful evidence, but the decisive outcome is a more profitable, reliably qualifying dispatcher. [Research and evaluation requirements](/Users/yerzham/Documents/ChatGPT/BAHN/docs/first-round-findings-and-research-plan.md)