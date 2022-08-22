import { initiateTest } from "@/utils/unit-tests/test-mockup-fn";
import { screen } from "@testing-library/react";
import MyLiquidityCover from "@/pages/my-liquidity/[cover_id]/index";

jest.mock("@/src/modules/my-liquidity/details", () => ({
  MyLiquidityCoverPage: () => {
    return <div data-testid="my-liquidity-cover-page"></div>;
  },
}));

describe("MyLiquidityCover test", () => {
  const { initialRender, rerenderFn } = initiateTest(MyLiquidityCover);

  beforeEach(() => {
    initialRender();
  });

  test("should display MyLiquidityCoverPage component", () => {
    const coverPage = screen.getByTestId("my-liquidity-cover-page");
    expect(coverPage).toBeInTheDocument();
  });

  test("Should display coming soon", () => {
    rerenderFn({ disabled: true });
    const comingSoon = screen.getByText("Coming soon!");
    expect(comingSoon).toBeInTheDocument();
  });
});
