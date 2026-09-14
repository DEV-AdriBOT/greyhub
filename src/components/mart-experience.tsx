"use client";

import Image from "next/image";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Worker = {
  id: number;
  username: string;
};

type CartLine = {
  id: number;
  foodId: string;
  worker: string;
};

const foods = [
  { id: "apple", name: "Red Apple", price: 2.25, code: "A1" },
  { id: "bread", name: "Fresh Bread", price: 3.5, code: "A2" },
  { id: "cooked_beef", name: "Cooked Beef", price: 6.75, code: "B1" },
  { id: "baked_potato", name: "Baked Potato", price: 3.25, code: "B2" },
  { id: "golden_carrot", name: "Golden Carrot", price: 8.5, code: "C1" },
  { id: "pumpkin_pie", name: "Pumpkin Pie", price: 4.75, code: "C2" },
  { id: "cookie", name: "Cookie", price: 1.75, code: "D1" },
  { id: "melon_slice", name: "Melon Slice", price: 2.0, code: "D2" },
] as const;

const adverts = [
  {
    label: "SHIFT SPECIAL",
    title: "Golden lunch hour",
    copy: "Golden carrots are 15% off until the evening bell.",
    color: "amber",
  },
  {
    label: "NEW ON THE SHELF",
    title: "Warm pumpkin pie",
    copy: "Packed this morning. Probably still warmer than the break room.",
    color: "red",
  },
  {
    label: "CREW NOTICE",
    title: "Bring your member pass",
    copy: "Members save 10% on the whole basket at checkout.",
    color: "green",
  },
] as const;

function foodImage(id: string) {
  return `/mart/items/${id}.png`;
}

export function MartExperience({ workers }: { workers: Worker[] }) {
  const [machineOpen, setMachineOpen] = useState(false);
  const [selectedFood, setSelectedFood] = useState<string | null>(null);
  const [packing, setPacking] = useState<{
    foodId: string;
    worker: string;
  } | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [memberPass, setMemberPass] = useState(false);
  const [adIndex, setAdIndex] = useState(0);
  const [hoverResponse, setHoverResponse] = useState(
    "Scanner idle — hover over the mart.",
  );
  const dotRef = useRef<HTMLSpanElement>(null);
  const lastDotMove = useRef(0);
  const lastResponse = useRef("");

  useEffect(() => {
    const interval = window.setInterval(
      () => setAdIndex((current) => (current + 1) % adverts.length),
      5200,
    );
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!packing) return;

    const timeout = window.setTimeout(() => {
      setCart((current) => [
        ...current,
        {
          id: Date.now(),
          foodId: packing.foodId,
          worker: packing.worker,
        },
      ]);
      setSelectedFood(null);
      setPacking(null);
    }, 1900);

    return () => window.clearTimeout(timeout);
  }, [packing]);

  const subtotal = useMemo(
    () =>
      cart.reduce(
        (sum, line) =>
          sum + (foods.find((food) => food.id === line.foodId)?.price ?? 0),
        0,
      ),
    [cart],
  );
  const discount = memberPass ? subtotal * 0.1 : 0;
  const total = subtotal - discount;
  const currentAd = adverts[adIndex];

  function assignWorker(worker: string, foodId: string | null) {
    if (!foodId || packing) return;
    setSelectedFood(foodId);
    setPacking({ worker, foodId });
  }

  function dropWorker(event: DragEvent<HTMLButtonElement>, foodId: string) {
    event.preventDefault();
    assignWorker(event.dataTransfer.getData("text/plain"), foodId);
  }

  function inspectMart(event: ReactPointerEvent<HTMLElement>) {
    if (event.pointerType === "touch") return;

    const now = performance.now();
    if (dotRef.current && now - lastDotMove.current > 140) {
      const rect = event.currentTarget.getBoundingClientRect();
      dotRef.current.style.opacity = "1";
      dotRef.current.style.transform = `translate(${event.clientX - rect.left - 6}px, ${event.clientY - rect.top - 6}px)`;
      lastDotMove.current = now;
    }

    const response = (event.target as HTMLElement)
      .closest<HTMLElement>("[data-mart-response]")
      ?.dataset.martResponse;
    if (response && response !== lastResponse.current) {
      lastResponse.current = response;
      setHoverResponse(response);
    }
  }

  function stopInspecting() {
    if (dotRef.current) dotRef.current.style.opacity = "0";
    lastResponse.current = "";
    setHoverResponse("Scanner idle — hover over the mart.");
  }

  return (
    <div className="mart-page">
      <header className="mart-intro">
        <div>
          <p>GREY COMPANY · STAFF CONVENIENCE</p>
          <h1>Grey Mart</h1>
        </div>
        <span>Open all shifts</span>
      </header>

      <section
        className={`mart-scene${packing ? " is-packing" : ""}`}
        aria-label="Interactive Grey Mart vending counter"
        onPointerMove={inspectMart}
        onPointerLeave={stopInspecting}
      >
        <div className="mart-awning" aria-hidden="true" />

        <div
          className="mart-sign"
          data-mart-response="Jupiters Steel orbit checked. Delivery systems are nominal."
        >
          <span className="orbit-mark" aria-hidden="true">
            <i />
            <b />
          </span>
          <span className="orbit-sign-copy">
            <strong>JUPITERS STEEL</strong>
            <small>Official delivery crates</small>
            <em>“Our vending machine is top of the uhh—stratosphere.”</em>
          </span>
        </div>

        <p className="mart-scan-response" aria-live="polite">
          <span /> {hoverResponse}
        </p>

        <div
          className="mart-discounts"
          aria-label="Discount tags"
          data-mart-response="Discount scan: two approved snacks can leave together for $5."
        >
          <span>SHIFT DEAL</span>
          <strong>2 snacks<br />for $5</strong>
          <small>Today only</small>
        </div>

        <div
          className="mart-total"
          aria-live="polite"
          data-mart-response="Register check: totals update after each crate reaches the counter."
        >
          <span>REGISTER TOTAL</span>
          <strong>${total.toFixed(2)}</strong>
          {discount > 0 && <small>Member saving −${discount.toFixed(2)}</small>}
        </div>

        <div className="mart-window">
          <span className="mart-window-line" />
          <span className="mart-window-sticker">FRESH<br />DAILY</span>
          <div className="mart-plant inside" aria-label="Indoor plant">
            <i /><i /><i /><b />
          </div>
        </div>

        <div
          className="mart-machine-wrap"
          data-mart-response="Our vending machine is top of the uhh—stratosphere."
        >
          <div
            className={`mart-machine${machineOpen ? " is-open" : ""}`}
          >
            <span className="machine-head">
              <b>TRAIL BITES</b>
              <i>HOT · COLD · BLOCKY</i>
            </span>
            {!machineOpen ? (
              <button
                type="button"
                className="machine-closed"
                onClick={() => setMachineOpen(true)}
                aria-expanded="false"
              >
                <i className="machine-glow" />
                <strong>PRESS TO BROWSE</strong>
                <small>The machine rattles when it gets impatient.</small>
              </button>
            ) : (
              <span className="machine-products">
                {foods.map((food) => (
                  <button
                    type="button"
                    key={food.id}
                    className={selectedFood === food.id ? "selected" : ""}
                    onClick={() => setSelectedFood(food.id)}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => dropWorker(event, food.id)}
                    disabled={Boolean(packing)}
                    aria-label={`${food.name}, $${food.price.toFixed(2)}. Drop a worker here.`}
                    data-mart-response={`${food.name}: shelf ${food.code}, priced at $${food.price.toFixed(2)}.`}
                  >
                    <Image
                      src={foodImage(food.id)}
                      alt=""
                      width={32}
                      height={32}
                      unoptimized
                    />
                    <b>{food.code}</b>
                    <span>${food.price.toFixed(2)}</span>
                  </button>
                ))}
              </span>
            )}
            <span className="machine-controls">
              <i>READY</i>
              <b>●</b>
              <em />
            </span>
            <span className="machine-hatch">COLLECT</span>
          </div>
          {machineOpen && (
            <button
              type="button"
              className="machine-close"
              onClick={() => {
                setMachineOpen(false);
                setSelectedFood(null);
              }}
            >
              Close machine
            </button>
          )}
        </div>

        <aside
          className="mart-delivery"
          aria-label="Delivery assignment"
          data-mart-response="Jupiters Steel crates are standing by for a crew assignment."
        >
          <div className="delivery-copy">
            <span>DELIVERY SHELF</span>
            <strong>
              {packing
                ? `Packing for ${packing.worker}`
                : selectedFood
                  ? "Now choose a worker"
                  : "Select a snack first"}
            </strong>
          </div>

          <div className="worker-tags">
            {workers.map((worker) => (
              <button
                type="button"
                draggable={!packing}
                key={worker.id}
                onDragStart={(event) => {
                  event.dataTransfer.setData("text/plain", worker.username);
                  event.dataTransfer.effectAllowed = "move";
                }}
                onClick={() => assignWorker(worker.username, selectedFood)}
                disabled={!selectedFood || Boolean(packing)}
                data-mart-response={`Assign the selected snack to ${worker.username}.`}
              >
                <span>{worker.username.slice(0, 1).toUpperCase()}</span>
                {worker.username}
                <i>DRAG</i>
              </button>
            ))}
          </div>

          <div className={`delivery-boxes${packing ? " opening" : ""}`}>
            {["01", "02", "03"].map((box) => (
              <div className="delivery-box" key={box}>
                <i className="box-lid left" />
                <i className="box-lid right" />
                <Image
                  src="/mart/jupiters-steel.png"
                  alt="Jupiters Steel"
                  width={650}
                  height={650}
                  unoptimized
                />
                <span>GH<br />{box}</span>
              </div>
            ))}
          </div>
        </aside>

        <div
          className="mart-counter"
          data-mart-response="Checkout counter checked. Vended items land here after packing."
        >
          <div className="counter-top">
            <span>CHECKOUT</span>
            <div className="counter-items" aria-label="Items at checkout">
              {cart.slice(-6).map((line) => (
                <span key={line.id} title={`${line.worker}'s ${line.foodId.replaceAll("_", " ")}`}>
                  <Image
                    src={foodImage(line.foodId)}
                    alt=""
                    width={32}
                    height={32}
                    unoptimized
                  />
                </span>
              ))}
            </div>
          </div>
          <div className="counter-front">
            <div>
              <span>{cart.length} item{cart.length === 1 ? "" : "s"}</span>
              <strong>{cart.length ? "Ready at the counter" : "Counter is clear"}</strong>
            </div>
            {cart.length > 0 && (
              <button type="button" onClick={() => setCart([])}>
                Clear order
              </button>
            )}
          </div>
        </div>

        <aside
          className="mart-misc"
          aria-label="Membership and business cards"
          data-mart-response="Crew Pass detected: activate it for a 10% basket discount."
        >
          <span className="misc-label">TAKE ONE</span>
          <button
            type="button"
            className={`member-card${memberPass ? " active" : ""}`}
            onClick={() => setMemberPass((current) => !current)}
            aria-pressed={memberPass}
          >
            <small>GREY MART</small>
            <strong>CREW PASS</strong>
            <span>{memberPass ? "10% APPLIED" : "CLICK TO USE"}</span>
          </button>
          <div className="business-cards">
            <span>GREY COMPANY</span>
            <small>Orders · Builds · Delivery</small>
          </div>
        </aside>

        <aside
          className={`mart-ad ${currentAd.color}`}
          aria-label="Electronic advertisement"
          data-mart-response="Electronic notice board online. The screen rotates automatically."
        >
          <div className="ad-scanline" />
          <span>{currentAd.label}</span>
          <strong>{currentAd.title}</strong>
          <p>{currentAd.copy}</p>
          <div className="ad-dots">
            {adverts.map((ad, index) => (
              <button
                type="button"
                key={ad.title}
                className={index === adIndex ? "active" : ""}
                onClick={() => setAdIndex(index)}
                aria-label={`Show advertisement ${index + 1}`}
              />
            ))}
          </div>
        </aside>

        <div className="mart-plant outside left" aria-label="Plant outside the storefront">
          <i /><i /><i /><b />
        </div>
        <div className="mart-plant outside right" aria-label="Plant outside the storefront">
          <i /><i /><i /><b />
        </div>

        {packing && (
          <div className="mart-flying-item" aria-hidden="true">
            <Image
              src={foodImage(packing.foodId)}
              alt=""
              width={32}
              height={32}
              unoptimized
            />
          </div>
        )}
        <span className="mart-cursor-dot" ref={dotRef} aria-hidden="true" />
      </section>

      <footer className="mart-help">
        <p>
          Open the machine, pick food, then drag a worker tag onto that item.
          On touch screens, tap the food and then the worker.
        </p>
        <p>
          Item textures from the{" "}
          <a href="https://faithfulpack.net" target="_blank" rel="noreferrer">
            Faithful 32x Resource Pack
          </a>{" "}
          under its <a href="/mart/FAITHFUL-LICENSE.txt">license</a>.
        </p>
      </footer>
    </div>
  );
}
