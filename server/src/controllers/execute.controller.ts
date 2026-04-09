import { Request, Response } from "express";
import { getAssetPrice } from "../core/integrations/coingecko";
import { executeSwap } from "../core/engine/folksRouter";
import { sendTelegramAlert } from "../core/integrations/telegram";

export const runWorkflow = async (req: Request, res: Response) => {
  try {
    const { nodes, edges } = req.body;
    let context: any = {}; // Stores data between blocks (e.g., current price)

    console.log("🏁 Executing Workflow...");

    // 1. Sort nodes by X-position for linear execution (Node 1 -> 2 -> 3)
    const sortedNodes = nodes.sort(
      (a: any, b: any) => a.position.x - b.position.x,
    );

    for (const node of sortedNodes) {
      console.log(`📡 Processing: ${node.type}`);

      switch (node.type) {
        case "PriceMonitorNode":
          context.currentPrice = await getAssetPrice(node.data.asset || "ALGO");
          console.log(
            `💰 Current ${node.data.asset} Price: $${context.currentPrice}`,
          );
          break;

        case "ComparatorNode":
          const { condition, threshold } = node.data;
          const isMet = eval(
            `${context.currentPrice} ${condition} ${threshold}`,
          );

          if (!isMet) {
            console.log("🛑 Condition not met. Stopping workflow.");
            return res
              .status(200)
              .json({ status: "stopped", reason: "Condition false" });
          }
          console.log("✅ Condition met. Proceeding...");
          break;

        case "SwapTokenNode":
          console.log(
            `🔀 Preparing Swap: ${node.data.amount} ${node.data.fromAsset}`,
          );
          // This is where your Web3 teammate will plug in the Folks Router logic
          break;

        case "SendTelegramNode":
          console.log(`🤖 Alert Triggered: ${node.data.messageTemplate}`);
          // Last step: implementation of Telegram bot call
          break;

        case "SwapTokenNode":
          console.log(
            `🔀 Preparing Swap: ${node.data.amount} ${node.data.fromAsset}`,
          );

          // We need the user's wallet address from the request to prepare the TX
          const userWallet = req.body.userWallet;

          const swapData = await executeSwap(
            userWallet,
            node.data.fromAsset,
            node.data.toAsset,
            node.data.amount,
          );

          // Store the prepared transaction in context to send back to the frontend
          context.preparedTransaction = swapData;
          console.log("💎 Swap transaction prepared for Pera Wallet signing.");
          break;

        case "SendTelegramNode":
          const template =
            node.data.messageTemplate || "Workflow executed successfully!";

          // Replace placeholders if you have context data
          const finalMessage = template.replace(
            "{{price}}",
            context.currentPrice?.toString() || "",
          );

          console.log(`🤖 Sending Telegram: ${finalMessage}`);
          await sendTelegramAlert(finalMessage);
          break;
      }
    }

    res.status(200).json({ status: "success", message: "Workflow executed" });
  } catch (error) {
    console.error("Execution Engine Error:", error);
    res.status(500).json({ error: "Workflow failed" });
  }
};
