import { formatDayLabel } from "./format.js";

/**
 * A small ARIA tabs widget (roving tabindex, Arrow/Home/End keys) for
 * switching the day shown in the full schedule view. Rebuilds its buttons
 * only when the set of days actually changes; selecting a day never steals
 * focus on its own (only keyboard navigation does), so it's safe to call
 * `select` again on every periodic schedule refresh.
 */
export class DayTabs {
  private days: string[] = [];
  private buttons: HTMLButtonElement[] = [];
  private selected = "";

  constructor(
    private readonly tablistEl: HTMLElement,
    private readonly panelId: string,
    private readonly onSelect: (day: string) => void,
  ) {
    this.tablistEl.addEventListener("keydown", (event) => this.handleKeydown(event));
  }

  setDays(days: string[]): void {
    if (days.join("|") === this.days.join("|")) return;
    this.days = days;
    this.tablistEl.textContent = "";
    this.buttons = days.map((day) => {
      const button = document.createElement("button");
      button.type = "button";
      button.setAttribute("role", "tab");
      button.id = `day-tab-${day}`;
      button.setAttribute("aria-controls", this.panelId);
      button.setAttribute("aria-selected", "false");
      button.tabIndex = -1;
      button.textContent = formatDayLabel(day);
      button.addEventListener("click", () => this.select(day));
      this.tablistEl.append(button);
      return button;
    });
  }

  select(day: string): void {
    const index = this.days.indexOf(day);
    if (index === -1) return;
    this.selected = day;
    this.buttons.forEach((button, i) => {
      const isSelected = i === index;
      button.setAttribute("aria-selected", String(isSelected));
      button.tabIndex = isSelected ? 0 : -1;
    });
    this.onSelect(day);
  }

  private handleKeydown(event: KeyboardEvent): void {
    const currentIndex = this.days.indexOf(this.selected);
    if (currentIndex === -1 || this.days.length === 0) return;

    let nextIndex: number;
    switch (event.key) {
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + this.days.length) % this.days.length;
        break;
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % this.days.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = this.days.length - 1;
        break;
      default:
        return;
    }

    event.preventDefault();
    const nextDay = this.days[nextIndex];
    if (nextDay === undefined) return;
    this.select(nextDay);
    this.buttons[nextIndex]?.focus();
  }
}
