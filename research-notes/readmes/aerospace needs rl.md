
My first week at MDA was great. The company culture is genuinely strong, the people are great, and it feels like a place where real engineering happens. But I also realized there is one fundamental issue that I think exists in a lot of aerospace companies: the field is still hesitant about adopting AI and Reinforcement Learning.

I realized this when I proposed the idea of using Reinforcement Learning instead of a genetic algorithm for friction characterization of one of the joints on the Canadarm. The task was not to randomly replace a proven controller with a black-box neural network. The idea was more specific: use RL as a way to characterize physical parameters more efficiently, especially if we eventually want to scale the method to other joint properties and more complex physical variables.

The reaction made sense. Senior engineers are not skeptical for no reason. Aerospace is safety-critical. If a method works, has been validated, and has years of engineering heritage behind it, then there is a very good reason to keep using it. Classical GNC methods, optimization techniques, Kalman filters, LQR, PID, MPC, and even genetic algorithms are trusted because they are understandable, testable, and familiar.

So I completely understand the question: why change something that already works?

But I think this is where aerospace has to be careful. If we only use algorithms because they have been used in the past, then new algorithms never get enough development time to become trusted in the future, and inherently, we cannot develop scalable and more compute efficient systems.

That is the paradigm I think needs to change.

## The Scalability Problem

For small parameter identification problems, genetic algorithms can work well. Suppose we are trying to characterize a robotic joint using a few physical parameters:

$$
\theta = [b, \tau_c, J]
$$

where $b$ is viscous friction, $\tau_c$ is Coulomb friction, and $J$ is inertia.

A genetic algorithm searches over possible values of $\theta$, runs a simulation, compares it to measured joint data, and tries to minimize the error:

$$
J(\theta) = \sum_{t=1}^{T} \left\| q_{\text{measured}}(t) - q_{\text{simulated}}(t; \theta) \right\|^2
$$

The optimizer is trying to find:

$$
\theta^* = \arg\min_{\theta} J(\theta)
$$

This is a perfectly reasonable approach. But the issue is that the search space gets large very quickly. If each parameter has $k$ possible values and there are $d$ parameters, then the rough size of the search space scales like:

$$
O(k^d)
$$

So if we only have three parameters, this might be fine. But what happens when we want to characterize more than just friction? What if we also want to estimate stiffness, damping, backlash, thermal effects, actuator lag, payload effects, sensor drift, and structural flex?

Now the parameter vector becomes something like:

$$
\theta =
[
b,
\tau_c,
J,
k,
d,
\Delta T,
\tau_{\text{lag}},
\delta_{\text{backlash}},
m_{\text{payload}},
\epsilon_{\text{sensor}}
]
$$

At that point, the problem becomes much harder. It is not just one joint anymore. It is a high-dimensional physical system.

This is where I think standard optimization starts to become less scalable. Every time the system changes, or the operating condition changes, or the physical variables change, we may need to rerun a large optimization process. Bayesian Optimization can help because it builds a surrogate model, but even then, the surrogate can struggle when the real system is highly nonlinear and the parameter space is large.

That is the main issue: for small systems, classical optimization is enough. For larger systems, especially future space systems, we need methods that can learn patterns across many regimes instead of re-solving from scratch every time.

## Where RL Becomes Interesting

The point of RL is not that it magically replaces every algorithm. The point is that RL can learn a policy from interaction with an environment. Instead of manually searching for one optimal parameter set every time, we can train a policy that learns how to act across many different cases.

A policy can be written as:

$$
u_t = \pi_\phi(x_t)
$$

where $x_t$ is the current state of the system, $u_t$ is the action, and $\pi_\phi$ is the learned policy.

The goal is to maximize expected return:

$$
\max_\phi \mathbb{E}
\left[
\sum_{t=0}^{T}
\gamma^t r(x_t, u_t)
\right]
$$

In aerospace terms, the reward might include tracking accuracy, energy efficiency, stability, low actuator usage, or safe terminal conditions.

For example, in a robotic joint characterization problem, an RL-based method could learn how to choose excitation trajectories, control inputs, or parameter updates that reveal useful information about the system. Instead of blindly searching the whole parameter space, it can learn which actions reduce uncertainty the most.

That matters because future space systems are going to be much more complex. We are talking about larger space stations, autonomous orbital robotics, space infrastructure, servicing missions, and eventually systems that need to operate with minimal human intervention. If we want digital twins that continuously update from telemetry and help us monitor system health from Earth, then the algorithms we use need to scale.

A genetic algorithm may work for one isolated parameter search. But for a large, adaptive system, we need algorithms that can reuse experience.

That is the key difference.

Classical optimization often solves one problem instance.

RL tries to learn behavior that generalizes across problem instances.

## Why This Is Not About Replacing GNC

I think this is where people sometimes misunderstand the argument.

Saying “aerospace needs RL” does not mean “throw away GNC.” That would actually be a terrible idea. Classical GNC is still the foundation. PID, LQR, MPC, Kalman filtering, trajectory optimization, and classical system identification are not going away. They are useful because they are structured, interpretable, computationally efficient, and mathematically grounded.

The real opportunity is not pure RL replacing GNC.

The opportunity is hybrid control.

For example, suppose we have a classical controller:

$$
u_{\text{classical}} = Kx
$$

This could be an LQR controller stabilizing the system around a nominal trajectory. Instead of asking RL to control everything from scratch, we can use RL to learn a correction term:

$$
u = u_{\text{classical}} + \Delta u_{\text{RL}}
$$

where:

$$
\Delta u_{\text{RL}} = \pi_\phi(x)
$$

This is a much better framing for aerospace. The classical controller gives us stability and structure. The RL policy only learns the residual behaviour that the classical controller does not handle well.

We can also constrain the RL correction:

$$
\|\Delta u_{\text{RL}}\| \leq \epsilon
$$

and enforce actuator limits:

$$
u_{\min} \leq u \leq u_{\max}
$$

So the RL policy is not allowed to do anything it wants. It is not a black box with unlimited authority. It is a bounded adaptive component inside a classical control architecture.

This is exactly the type of approach that makes learning-based control more realistic for aerospace.

## A Rocket Landing Example

This is also what I learned from my own [6DOF rocket landing project](https://www.jaivalpatel.com/rl-6dof-landing.html).

At first, it is tempting to say: let PPO learn the whole landing problem. Give it the rocket state, give it the actuator commands, define a reward, and let it train. But in practice, that is extremely hard because the parameter space is just too large in the first place. The rocket landing problem has too many things happening at once: vertical braking, lateral error correction, attitude stabilization, thrust limits, fuel constraints, terminal velocity requirements, and nonlinear dynamics. If the RL agent has to solve everything from scratch, the learning problem becomes very messy.

So the better approach is to use structure.

A classical controller can handle stabilization. Then RL can focus on improving the part of the problem that is difficult to hand-design. In my case, a hybrid structure worked much better than a pure RL approach. The system was able to solve the lateral and attitude problem very well, while the remaining bottleneck became the vertical touchdown speed.

That is actually useful, because it means the failure mode became clear. Instead of the whole system failing in an unstructured way, the hybrid approach isolated the problem.

This is why I think RL in aerospace should be framed differently.

Not:

$$
\text{RL replaces control}
$$

but:

$$
\text{RL improves parts of the control stack}
$$

That is a much stronger argument.

## Safety Should Be Built Into the Architecture

The biggest argument against RL is safety. And that argument is valid. Unconstrained RL is not something you just deploy on a spacecraft. A neural network policy trained in simulation should not be blindly trusted with a real aerospace system. There can be simulation mismatch, distribution shift, sensor noise, actuator delay, and edge cases that the policy never saw during training.

But I don't think that means RL can never be used in aerospace.

It means RL has to be wrapped in safety.

For example, an RL policy can propose an action:

$$
u_{\text{RL}}
$$

but before the action is executed, it passes through a safety filter:

$$
u_{\text{safe}} =
\Pi_{\mathcal{U}_{\text{safe}}}
(u_{\text{RL}})
$$

where $\Pi_{\mathcal{U}_{\text{safe}}}$ projects the action into the safe action set.

In simpler terms, the RL policy can suggest an action, but the system only executes it if the action is safe. We can also use hard constraints, fault monitors, fallback controllers, control barrier functions, runtime verification, and classical backup modes. The architecture can look like this:

$$
u_{\text{RL}}
\rightarrow
\text{safety filter}
\rightarrow
\text{classical fallback check}
\rightarrow
u_{\text{executed}}
$$

That is the kind of structure aerospace needs.

The goal is not to sacrifice safety for AI. The goal is to build AI systems where safety is enforced by design.

This is why I think saying “RL is unsafe” is too broad. Pure black-box RL is unsafe. Unverified RL is unsafe. But constrained RL, residual RL, model-based RL, and hybrid RL can be developed in a much more rigorous way.

## What I Mean by a Safety Filter

When I say RL should be wrapped in safety, I do not mean a vague system that checks whether something “looks safe.” I mean an explicit mathematical layer between the RL policy and the actuator command.

The RL policy proposes an action:

$$
u_{\text{RL}} = \pi_\phi(x)
$$

where $x$ is the current state and $u_{\text{RL}}$ is the action suggested by the policy.

But instead of sending $u_{\text{RL}}$ directly to the system, we pass it through a safety filter:

$$
u_{\text{safe}} = \text{Filter}(x, u_{\text{RL}})
$$

The filter checks whether the proposed action satisfies the system constraints. These constraints could include actuator limits, thermal limits, joint torque limits, collision constraints, attitude constraints, keep-out zones, or terminal safety requirements.

For example, if the system has actuator limits, then the final command must satisfy:

$$
u_{\min} \leq u_{\text{safe}} \leq u_{\max}
$$

If the RL policy asks for an impossible torque or thrust command, the safety filter clips or projects that command back into the allowed region.

A simple version is:

$$
u_{\text{safe}} =
\text{clip}
(
u_{\text{RL}},
u_{\min},
u_{\max}
)
$$

But this is only the simplest case. A real aerospace safety filter would care about more than actuator saturation. It would care about the future state of the system.

Suppose we define a safe set:

$$
\mathcal{S} = \{x : h(x) \geq 0\}
$$

where $h(x)$ is a safety function. If $h(x) \geq 0$, the system is safe. If $h(x) < 0$, the system is unsafe.

For a rocket landing problem, $h(x)$ could represent a constraint like:

$$
h(x) = v_{\max}(z) - |v_z|
$$

where $v_z$ is vertical velocity and $v_{\max}(z)$ is the maximum safe vertical velocity at altitude $z$.

This means the rocket is only considered safe if its descent speed is not too high for its current altitude:

$$
v_{\max}(z) - |v_z| \geq 0
$$

or:

$$
|v_z| \leq v_{\max}(z)
$$

In plain English: if the rocket is close to the ground, it must not be descending too fast.

If the RL policy proposes an action that would cause the rocket to violate this condition in the next timestep, the safety filter overrides it.

Mathematically, the filter can solve a small optimization problem:

$$
u_{\text{safe}}
=
\arg\min_u
\|u - u_{\text{RL}}\|^2
$$

subject to:

$$
u_{\min} \leq u \leq u_{\max}
$$

$$
x_{t+1} = f(x_t, u)
$$

$$
h(x_{t+1}) \geq 0
$$

This means to choose the action closest to what the RL policy wanted, but only if it keeps the system safe.

That is the important part. The RL policy still influences the behavior, but the safety filter has final authority.

In plain English:

> Let RL be creative, but do not let it violate physics, actuator limits, or mission safety constraints.

This makes the architecture much more acceptable for aerospace.

The RL policy is no longer a black box directly controlling the system. It is a performance-improving layer whose actions are checked by a model-based safety system.

## Aerospace Already Has the Right Environment for RL

Another reason I think aerospace should take RL more seriously is that aerospace already has the tools RL needs.

RL needs simulation.

Aerospace has simulation.

RL needs dynamics models.

Aerospace has dynamics models.

RL needs Monte Carlo testing.

Aerospace already uses Monte Carlo testing.

RL needs hardware-in-the-loop validation.

Aerospace already does hardware-in-the-loop validation.

So the foundation is already there. The missing piece is not the infrastructure. The missing piece is the willingness to seriously integrate learning-based methods into the development process.

A learning-based controller can be trained across randomized environments:

$$
m \sim \mathcal{M}, \quad
d \sim \mathcal{D}, \quad
w \sim \mathcal{W}
$$

where $m$ represents mass properties, $d$ represents disturbances, and $w$ represents environmental uncertainty.

Then we can evaluate it over many Monte Carlo rollouts:

$$
P(\text{success})
=
\frac{1}{N}
\sum_{i=1}^{N}
\mathbf{1}[\text{success}_i]
$$

This does not prove the system is safe by itself. But it gives us a way to stress-test the controller across thousands or millions of cases. It helps expose failure modes earlier. It helps us understand where the controller is robust and where it breaks.

That is not replacing engineering rigor.

That is adding another layer to it.

## The Real Argument

I read a quote from *The Book of Elon* where Elon says that if people do not think there is a way, they will not keep bashing their heads against the wall to make progress.

I think that applies here.

A lot of aerospace is still stuck in the mindset that standard GNC algorithms should be used because they have always been used. Again, I understand why. Aerospace is not consumer software. You do not just ship, break things, and patch later. The cost of failure is too high.

But if we never invest seriously in RL for aerospace, then RL will never become mature enough for aerospace.

That is the contradiction.

We cannot say, “RL is not ready,” while also refusing to do the work required to make it ready.

The better path is to keep using classical GNC where it works, while investing heavily in learning-based methods in simulation, digital twins, testbeds, and non-flight-critical subsystems. Then, as these methods become more reliable, we can start integrating them into hybrid architectures.

Not all at once.

Not recklessly.

But seriously.
