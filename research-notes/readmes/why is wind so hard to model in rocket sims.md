[[article]]

After looking back on the [RL-Enhanced 6DOF Landing Project](), I recognized that one of the biggest challenges in that project was working with wind. Yes, not the physics of the vehicle or the TVC aspect, but simply the wind. 

## The Deceptively Simple Question

When I was building the physics simulator for my [RL-Enhanced 6DOF Landing Project](link), I thought modelling wind should be the easy part. Gravity is a constant. Thrust is a lookup table. Drag is a function of velocity squared. Wind is just a vector that pushes the vehicle sideways.

But that's when I was wrong. Wind is arguably the hardest single disturbance to model faithfully, and this post explains why - mathematically, physically, and from the perspective of a controller designer trying to land a 120-tonne vehicle in a 5 m/s crosswind.

## Wind Is Not a Vector. It's a Random Field

The first misconception is treating wind as a single number or direction. In reality, wind is a spatiotemporal stochastic process: a random field $\mathbf{w}(\mathbf{x}, t) \in \mathbb{R}^3$ that varies continuously in three spatial dimensions and in time.

For a landing trajectory that spans 150 m of altitude and 30 seconds of flight, the vehicle passes through multiple wind regimes simultaneously. What the base experiences is not what the nosecone experiences.

### The Power-Law Vertical Profile

The most common approximation - and the one we use is the power-law wind shear model:

$$ w(z) = w_{ref} \cdot \left(\frac{z}{z_{ref}}\right)^\alpha $$

where:
- $w_{ref}$ is the reference wind speed at reference altitude $z_{ref}$ (typically 10 m)
- $z$ is current altitude AGL
- $\alpha$ is the **wind shear exponent**, typically $\alpha \approx 0.14$ over open terrain (Hellmann exponent) but ranging from $0.10$ (sea surface) to $0.40$ (dense urban canopy)

This gives us a profile that increases with altitude - matching the physical intuition that surface friction decelerates the near-ground boundary layer. Now the problem with this model is that it's deterministic and mean-field. But, real wind is neither. The power law gives you the expected wind at altitude $z$, not the instantaneous wind. The residual is a turbulent fluctuation that can easily be $\pm 30\%$ of the mean.

## The Turbulence Problem

Turbulence is the true enemy. It is characterized by the **turbulence intensity**:

$$ I_u = \frac{\sigma_u}{\bar{u}} $$

where $\sigma_u$ is the standard deviation of the stream-wise velocity fluctuations and $\bar{u}$ is the mean wind speed. For low-level flight ($z < 200$ m), $I_u$ can reach $20\text{–}30\%$. The frequency content of turbulence follows the von Kármán spectrum (or the Dryden approximation used in flight mechanics):

$$ S_{uu}(f) = \sigma_u^2 \cdot \frac{4L_u/\bar{u}}{[1 + (2\pi f L_u/\bar{u})^2]^{5/6}} $$

where $L_u$ is the integral length scale, the characteristic size of the dominant eddies. Near the ground, $L_u \approx 10\text{–}100$ m. This spectrum matters enormously for controller design. The energy distribution tells us at what frequencies the wind is driving the vehicle. If the dominant eddy timescale $\tau_{eddy} = L_u / \bar{u}$ is comparable to the vehicle's attitude time constant $\tau_{att}$, we get **resonant disturbance coupling**. The wind excites exactly the dynamics the attitude controller is trying to suppress.

For a Starship-class vehicle at low altitude:
- $L_u \approx 50$ m, $\bar{u} \approx 5$ m/s → $\tau_{eddy} \approx 10$ s
- TVC bandwidth $\sim 0.5$ Hz → $\tau_{att} \approx 2$ s

These are in the same order of magnitude. This is not a coincidence, it's the problem!

## Wind on a Tall, Slender Body

Even if we knew the wind field perfectly, applying it to the vehicle is non-trivial. A Starship-class vehicle is ~50 m tall and ~9 m in diameter, which is an aspect ratio of ~5.5. The wind vector at the base, midpoint, and nosecone are all different.

The **aerodynamic moment** induced by a laterally varying wind profile is:

$$ M_{wind} = \int_0^L \frac{1}{2} \rho(z) \left[w(z_0 + s) - \dot{x}_{cm}\right]^2 C_N(s) \cdot c_{ref} \cdot (s - s_{cp}) , ds $$

where:
- $z_0$ is the altitude of the vehicle base
- $s$ is the axial coordinate along the body
- $C_N(s)$ is the local normal force coefficient distribution
- $s_{cp}$ is the center of pressure location
- $\dot{x}_{cm}$ is the lateral velocity of the center of mass

In a simplified simulator, we collapse this integral to a single effective wind force applied at the center of pressure. This is the first major modeling compromise: we lose the spatial variation of wind along the vehicle body, which induces a distributed moment we approximate as a point load.

The error is bounded by the **wind gradient over the vehicle length**:

$$ \Delta M_{approx} \sim \frac{1}{2} \rho \bar{u} \cdot \frac{\partial w}{\partial z} \cdot L^2 \cdot C_N \cdot c_{ref} $$

At 50 m altitude with a 10 m/s wind and the power-law profile, $\partial w / \partial z \approx 0.04$ s$^{-1}$, giving a moment error on the order of a few hundred N·m, which is small relative to the TVC authority but non-negligible in precision landing.

## The Angle-of-Attack Coupling

Wind doesn't just push the vehicle, it actually changes the local angle of attack, which feeds back into the aerodynamic forces. We define the effective angle of attack as:

$$ \alpha_{eff} = \arctan\left(\frac{w_\perp - v_\perp}{v_{axial}}\right) \approx \frac{w_\perp - v_\perp}{v_{axial}} $$

where $w_\perp$ is the wind component perpendicular to the body axis and $v_\perp$ is the vehicle's lateral velocity component. The lateral aerodynamic force is then:

$$ F_{aero,\perp} = \frac{1}{2} \rho v_{rel}^2 \cdot S_{ref} \cdot C_N(\alpha_{eff}) $$

The critical insight: **$C_N$ is a nonlinear function of $\alpha_{eff}$**, and at high angles of attack (which occur during the landing flip maneuver), the linearization breaks down entirely. Our simulator uses a simplified linear $C_N = C_{N\alpha} \cdot \alpha_{eff}$, which is valid for $\alpha_{eff} < 15°$ but fails in the high-AoA regime. Furthermore, when wind produces a lateral velocity relative to the body, it also generates an induced drag component:

$$ \Delta D_{wind} = \frac{1}{2} \rho S_{ref} \left(C_{D0} + k \cdot C_N^2\right) \cdot v_{rel}^2 - \frac{1}{2} \rho S_{ref} C_{D0} \cdot v_{axial}^2 $$

This is typically ignored in simplified models, introducing a systematic underestimation of drag in crosswind conditions.

## The ISA Atmosphere Adds Another Layer

We use the **International Standard Atmosphere (ISA)** for air density:

$$ \rho(z) = \rho_0 \cdot \left(1 - \frac{L_{lapse} \cdot z}{T_0}\right)^{\frac{g M}{R L_{lapse}} - 1} $$

where $L_{lapse} = 0.0065$ K/m, $T_0 = 288.15$ K, $M = 0.029$ kg/mol.

The coupling with wind is subtle: aerodynamic forces scale as $\rho(z)$, so as the vehicle descends, the effective wind force increases even if wind speed is constant. At sea level vs. 150 m, $\Delta\rho / \rho \approx 2\%$, which is small, but it means the controller tuned at altitude is fighting slightly larger disturbances at touchdown. In our gain-scheduled LQR, we recompute the CARE solution at 7 altitude breakpoints precisely because of this effect.

## What This Means for the Controllers

### LQR:

The LQR formulation minimizes:

$$ J = \int_0^\infty \left(\mathbf{x}^T Q \mathbf{x} + \mathbf{u}^T R \mathbf{u}\right) dt $$

Wind enters as an unmodeled disturbance $\mathbf{d}(t)$ in the state equation:

$$ \dot{\mathbf{x}} = A\mathbf{x} + B\mathbf{u} + \mathbf{d}(t) $$

LQR has no explicit disturbance rejection, it minimizes the nominal cost assuming $\mathbf{d} = 0$. The gain-scheduled design gives robustness through bandwidth, not through explicit wind feedforward. In practice, the integral action implicit in our position error state helps, but the controller is fundamentally reactive: it waits for the wind to move the vehicle before correcting.

The stability margin against wind is governed by the gain margin of the closed-loop system, which we can bound using the return difference inequality for LQR:

$$ \left[I + L(j\omega)\right]^H \left[I + L(j\omega)\right] \geq I \quad \forall \omega $$

This guarantees at least 6 dB gain margin and 60°phase margin, but only against matched uncertainty in the input channels. Aerodynamic disturbances enter at the state level, not the input level, and the formal guarantees do not apply.

### PPO

PPO learns a policy $\pi_\theta(\mathbf{a} | \mathbf{o})$ that, given enough training diversity, can implicitly learn to anticipate and preemptively compensate for wind, something LQR fundamentally cannot do. The clipped surrogate objective:

$$ L^{CLIP}(\theta) = \mathbb{E}_t\left[\min\left(r_t(\theta)\hat{A}_t,\ \text{clip}(r_t(\theta), 1-\epsilon, 1+\epsilon)\hat{A}_t\right)\right] $$

enables policy updates that are robust to stochastic environments. If the training environment samples wind conditions from a distribution matching deployment, the policy develops implicit robustness, effectively learning a form of disturbance observer embedded in the neural network weights. The catch is that this requires the wind model during training to be representative of reality. If our power-law + Gaussian turbulence model systematically misrepresents the actual wind statistics (e.g., neglects gusts, underestimates integral length scales, ignores directional veering), the PPO policy will overfit to the wrong distribution and potentially perform worse than LQR under real conditions.

## The Fundamental Epistemological Problem

Our wind model is not wrong, it's calibrated to the wrong thing. The power-law profile + additive Gaussian noise captures the first and second moments of wind statistics. But landing safety is determined by **tail events**, the 99th percentile gust that arrives at the worst possible moment in the flip maneuver.

Tail risk in wind follows approximately a Weibull distribution:

$$ P(W > w) = \exp\left[-\left(\frac{w}{\lambda}\right)^k\right] $$

with shape parameter $k \approx 2$ (Rayleigh distribution) for many sites. A Gaussian model with the same mean and variance will systematically underestimate the probability of high-speed gusts. For Monte Carlo evaluation, this means our failure rate estimates are optimistic.

In our [technical blog](), we acknowledge this directly. Our Monte Carlo results are valid under the assumed wind model, not under real atmospheric conditions. This is not a weakness to hide — it's an honest statement of the **sim-to-real gap** that any deployed controller would face.

## What We Actually Do (And Why)

Given all the above, our simulator makes the following deliberate compromises:

|Physical effect|Treatment|Consequence|
|---|---|---|
|Vertical wind shear|Power-law profile|Mean profile accurate, misses shear-layer turbulence|
|Turbulence|Gaussian white noise per timestep|Correct variance, wrong temporal correlation|
|Wind along body length|Point force at CoP|Neglects distributed aerodynamic moment|
|AoA nonlinearity|Linear $C_N = C_{N\alpha} \alpha$|Valid below 15°, fails at high AoA|
|Wind-density coupling|ISA density at current $z$|Correctly captures altitude variation|
|Gust statistics|Gaussian tails|Underestimates extreme events|

These are not lazy choices. Each one represents a conscious tradeoff between simulation fidelity and tractability. A full CFD-coupled turbulence simulation would take hours per trajectory. We need thousands of Monte Carlo samples! 

## Why Wind Makes the RL Problem Uniquely Hard

Everything above describes wind as a modelling challenge. This section is about something different: why wind creates a learning challenge that is structurally distinct from the control challenge it poses for LQR. Even if we had a perfect wind model, RL would still struggle with it in ways that are worth unpacking precisely.

### Wind Is Not in the Observation Space

Our PPO agent operates on a 15-dimensional observation vector: quaternion attitude, angular rates, position (altitude only, following [Gaudet et al.]()), velocity, mass, and throttle state. **Wind is not observed.** The agent cannot measure what the wind is doing; it can only infer it from the effect wind has already had on the vehicle state.

This creates a partial observability problem. The true Markov state of the system is:

$$ \mathbf{s}_{true} = [\mathbf{q}, \boldsymbol{\omega}, \mathbf{p}, \mathbf{v}, m, \mathbf{w}(\mathbf{x}, t)] $$

But the agent only sees:

$$ \mathbf{o} = [\mathbf{q}, \boldsymbol{\omega}, p_z, \mathbf{v}, m, \delta_{throttle}] $$

The wind state $\mathbf{w}(\mathbf{x}, t)$ is hidden. The environment is therefore a Partially Observable MDP (POMDP) being approximated as a fully observable MDP. PPO's policy gradient theorem assumes the Markov property:

$$ P(\mathbf{s}_{t+1} | \mathbf{s}_t, \mathbf{a}_t) = P(\mathbf{s}_{t+1} | \mathbf{s}_1, \dots, \mathbf{s}_t, \mathbf{a}_1, \dots, \mathbf{a}_t) $$

This is violated whenever the wind at $t+1$ is correlated with its history, which, as  established earlier, it always is. The agent is trying to solve a POMDP with a policy class designed for MDPs. The result is that the "optimal" policy the agent converges to is actually the best memoryless policy, which is provably suboptimal in a partially observed environment. In practice this means the agent must learn to be **defensively robust** rather than **situationally adaptive**. It cannot react to wind it cannot see, so it must develop a policy that degrades gracefully across all wind realizations it might encounter.

### The Credit Assignment Problem Is Severe

Policy gradient methods learn by correlating actions with outcomes. The fundamental update is proportional to $\nabla_\theta \log \pi_\theta(\mathbf{a}_t | \mathbf{o}_t) \cdot \hat{A}_t$, where the advantage $\hat{A}_t$ measures how much better the action was than expected.

Wind poisons this signal in two ways.

First, wind introduces high variance into the return. Two identical trajectories with identical actions can produce wildly different returns purely because the wind realization differed. The variance of the policy gradient estimator is:

$$ \text{Var}\left[\hat{g}\right] = \mathbb{E}\left[\left(\nabla_\theta \log \pi_\theta \cdot \hat{A}_t\right)^2\right] - \left(\mathbb{E}\left[\nabla_\theta \log \pi_\theta \cdot \hat{A}_t\right]\right)^2 $$

High environmental stochasticity inflates the first term directly. This is why wind-heavy training requires significantly more rollouts to achieve the same gradient signal-to-noise ratio as a calm-air environment, an empirical fact we observed during training, where early episodes showed enormous reward variance before the policy stabilized.

Second, wind makes temporal credit assignment ambiguous. A lateral deviation at $t = 20$ s might be caused by a TVC command at $t = 15$ s, or by a wind gust at $t = 19$ s. The agent cannot distinguish these causes. PPO's generalized advantage estimator (GAE):

$$ \hat{A}_t = \sum_{l=0}^{\infty} (\gamma \lambda)^l \delta_{t+l}, \quad \delta_t = r_t + \gamma V(o_{t+1}) - V(o_t) $$

attributes the value of future states back to current actions, but when an unobserved disturbance (which in our case is wind) is responsible for the state transition, this attribution is systematically wrong. The agent may learn to suppress actions that were actually correct but happened to coincide with an adverse wind event.

### The Guidance-Control Hierarchy Amplifies Wind Sensitivity

Our hierarchical architecture separates a slow guidance policy (throttle, 1 Hz) from a fast control policy (TVC, 20 Hz). Wind affects both layers simultaneously but on different timescales. The guidance layer (responsible for the descent profile) must choose throttle commands that produce the right velocity at the right altitude. Wind changes the effective drag on the vehicle, which means the same throttle command produces a different velocity profile depending on the wind. The guidance policy must implicitly learn this coupling without observing wind directly.

The coupling can be written as:

$$ \dot{v}_z = \frac{T \cos\alpha}{m} - g - \frac{1}{2m}\rho(z) v_{rel}^2 S_{ref} C_D $$

where $v_{rel} = |\mathbf{v} - \mathbf{w}|$. Wind enters through $v_{rel}$, which means the effective drag, and therefore the throttle required to achieve a target deceleration, is actually a function of the hidden wind state! The guidance policy must learn this function from state observations alone, essentially performing implicit wind estimation as a latent skill.

However, the control layer faces a different problem: wind-induced lateral forces appear as persistent torques that must be counteracted by TVC deflection. But TVC deflection also affects the thrust vector direction, coupling lateral stabilization with vertical deceleration. Persistent crosswind therefore creates a sustained coupling between attitude control and throttle authority that the monolithic PPO architecture (which we discarded) could not resolve cleanly.

### Wind Creates Non-Stationarity in the Reward Landscape

The Gaudet velocity field reward tracks a position-dependent target velocity profile $\mathbf{v}^*(p_z)$. In calm air, this creates a smooth reward landscape: deviating from the target velocity profile costs reward proportionally. Wind deforms this landscape in a non-stationary way.

Consider the lateral velocity component. The target is $v_x^* = 0$ at all altitudes. Wind imposes a lateral acceleration $a_{wind} = F_{wind}/m$, which pushes $v_x$ away from zero. To maintain zero lateral velocity, the agent must learn to apply a TVC correction that exactly cancels $F_{wind}$. But $F_{wind}$ is itself a function of the unobserved wind field. The effective reward gradient with respect to TVC deflection $\delta_{TVC}$ then becomes:

$$ \frac{\partial r}{\partial \delta_{TVC}} = \frac{\partial r}{\partial v_x} \cdot \frac{\partial v_x}{\partial \delta_{TVC}} + \frac{\partial r}{\partial v_x} \cdot \underbrace{\frac{\partial v_x}{\partial w_x} \cdot \frac{\partial w_x}{\partial \delta_{TVC}}}_{= 0} $$

The second term is zero, TVC cannot affect wind. But the agent doesn't know this. In early training, with random policy, the agent may spuriously learn correlations between its actions and wind fluctuations simply because they co-occur in time. This produces reward hacking through wind correlation: the agent learns to execute actions that happened to coincide with favourable wind realizations, not because those actions caused favourable outcomes. This is distinct from the classical reward hacking we guard against with the terminal penalty. It is subtler, a form of confounding in the policy gradient signal, and it resolves only with sufficient sample diversity across wind conditions.

### Sample Efficiency: The Core Consequence

Putting it all together now, we understand that the wind forces the RL agent needs to solve is a harder problem than it appears. It must:

1. Implicitly estimate an unobserved disturbance from noisy state observations
2. Deconvolve its own contribution to state transitions from the wind's contribution
3. Learn a policy robust to the full distribution of wind realizations, not just the mean
4. Do all of this without any explicit wind supervision signal

Each of these requirements demands more samples. This is the mechanistic explanation for the **sample efficiency gap** we observe between LQR and PPO in our results. LQR requires no training samples, the wind appears as a disturbance to a pre-computed gain schedule, and the stability guarantees hold regardless of what the wind does. PPO must discover a robust strategy through trial and error in a stochastic environment where the source of much of the stochasticity is hidden.

The gap is not a failure of PPO as an algorithm. It is a structural consequence of asking a model-free RL agent to learn in a partially observed, stochastic environment, which is, inherently, what makes real rocket landing hard.