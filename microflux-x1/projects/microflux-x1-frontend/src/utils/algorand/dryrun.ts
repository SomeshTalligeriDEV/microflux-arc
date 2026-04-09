import algosdk, { Transaction } from 'algosdk';
import { getAlgodClient } from './client';
import { SimulationResult, SimulationStep } from '../../types/simulation';

/**
 * Run dry-run simulation on Algorand transactions
 */
export async function runSimulation(txns: Transaction[]): Promise<SimulationResult> {
  const algodClient = getAlgodClient();
  
  try {
    // Get fresh suggested params
    const suggestedParams = await algodClient.getTransactionParams().do();
    
    // Sign transactions with dummy signer for dryrun
    // In dryrun, we don't need valid signatures, just signed transaction format
    const signedTxns = txns.map((txn) => {
      // Create a dummy signature (64 bytes of zeros)
      const dummySig = new Uint8Array(64);
      return {
        txn: txn,
        sig: dummySig,
      } as any;
    });
    
    // Create dryrun request
    const dryrunRequest = await algosdk.createDryrun({
      client: algodClient,
      txns: signedTxns,
      sources: [],
    });
    
    // Execute dryrun
    const dryrunResult = await algodClient.dryrun(dryrunRequest).do();
    
    // Parse results into human-readable format
    const steps: SimulationStep[] = dryrunResult.txns.map((txnResult: any, index: number) => {
      const originalTxn = txns[index];
      const confirmedRound = txnResult['confirmed-round'];
      const poolError = txnResult['pool-error'];
      const logs = txnResult['logs'] || [];
      
      // Determine transaction type and details from the original transaction
      // In algosdk v3, we access transaction properties directly
      let description = 'Unknown';
      let sender = 'Unknown';
      let receiver: string | undefined;
      let amount: number | undefined;
      let assetId: number | undefined;
      let appId: number | undefined;
      let fee = 1000;
      
      try {
        // Try to decode using raw transaction bytes
        const rawTxn = originalTxn.toByte();
        const decoded = algosdk.decodeUnsignedTransaction(rawTxn) as any;
        
        sender = decoded.sender ? algosdk.encodeAddress(decoded.sender) : 'Unknown';
        fee = Number(decoded.fee || 1000);
        
        // Check transaction type by looking at properties
        if (decoded.type === 'pay' || decoded.receiver !== undefined) {
          description = 'Payment';
          receiver = decoded.receiver ? algosdk.encodeAddress(decoded.receiver) : undefined;
          amount = Number(decoded.amount || 0);
        } else if (decoded.type === 'axfer' || decoded.assetIndex !== undefined) {
          description = 'Asset Transfer';
          receiver = decoded.assetReceiver ? algosdk.encodeAddress(decoded.assetReceiver) : undefined;
          amount = Number(decoded.assetAmount || 0);
          assetId = Number(decoded.assetIndex);
        } else if (decoded.type === 'appl' || decoded.appIndex !== undefined) {
          appId = Number(decoded.appIndex);
          
          // Determine onComplete action
          const onComplete = Number(decoded.appOnComplete || 0);
          if (onComplete === 1) description = 'App OptIn';
          else if (onComplete === 2) description = 'App CloseOut';
          else if (onComplete === 3) description = 'App ClearState';
          else if (onComplete === 4) description = 'App Update';
          else if (onComplete === 5) description = 'App Delete';
          else description = 'App NoOp';
        }
      } catch (decodeErr) {
        // Fallback: use simple description based on what we know
        description = `Transaction ${index + 1}`;
      }
      
      return {
        step: index + 1,
        type: (description.toLowerCase().includes('payment') ? 'pay' : 
               description.toLowerCase().includes('asset') ? 'axfer' : 
               description.toLowerCase().includes('app') ? 'appl' : 'unknown') as any,
        description,
        sender,
        receiver,
        amount,
        assetId,
        appId,
        fee: Number(fee),
        status: poolError ? 'error' : 'success',
        error: poolError,
        logs,
      };
    });
    
    // Calculate total fees
    const totalFees = steps.reduce((sum, step) => sum + step.fee, 0);
    
    // Check for overall success
    const success = steps.every(step => step.status === 'success');
    const error = success ? undefined : steps.find(s => s.error)?.error;
    
    return {
      steps,
      totalFees,
      success,
      error,
      rawDryrunResponse: dryrunResult,
    };
    
  } catch (e: any) {
    return {
      steps: [],
      totalFees: 0,
      success: false,
      error: e.message || 'Dryrun failed',
    };
  }
}
