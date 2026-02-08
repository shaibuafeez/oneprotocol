module suivault::vault {
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};
    use sui::event;

    // ======== Error Codes ========
    const E_NOT_AGENT: u64 = 0;
    const E_INSUFFICIENT_BALANCE: u64 = 1;
    const E_VAULT_PAUSED: u64 = 2;
    const E_ZERO_AMOUNT: u64 = 3;

    // ======== Events ========
    public struct DepositEvent has copy, drop {
        depositor: address,
        amount: u64,
        vault_total: u64,
    }

    public struct WithdrawEvent has copy, drop {
        withdrawer: address,
        amount: u64,
        vault_total: u64,
    }

    public struct AgentRebalanceEvent has copy, drop {
        action: vector<u8>,
        amount_in: u64,
        amount_out: u64,
        price_signal: u64,
        timestamp: u64,
    }

    public struct AgentCrossChainEvent has copy, drop {
        action: vector<u8>,
        amount: u64,
        target_chain: vector<u8>,
        reason: vector<u8>,
    }

    // ======== Objects ========

    /// Admin capability for vault management
    public struct AdminCap has key, store {
        id: UID,
    }

    /// Main vault state - shared object
    public struct VaultState has key {
        id: UID,
        /// SUI balance held in vault
        sui_balance: Balance<SUI>,
        /// Agent address authorized to execute trades
        agent: address,
        /// Whether vault is accepting deposits
        is_active: bool,
        /// Target allocation: percentage in SUI (0-100)
        target_sui_pct: u64,
        /// Rebalance threshold: drift percentage before agent acts
        rebalance_threshold: u64,
        /// Total deposits tracked for share calculation
        total_deposits: u64,
        /// Total rebalances executed
        rebalance_count: u64,
    }

    /// User deposit receipt - tracks their share of the vault
    public struct DepositReceipt has key, store {
        id: UID,
        owner: address,
        amount: u64,
        deposit_time: u64,
    }

    // ======== Init ========
    fun init(ctx: &mut TxContext) {
        let admin_cap = AdminCap {
            id: object::new(ctx),
        };
        transfer::transfer(admin_cap, ctx.sender());
    }

    // ======== Admin Functions ========

    /// Create a new vault with specified agent address
    public entry fun create_vault(
        _admin: &AdminCap,
        agent: address,
        target_sui_pct: u64,
        rebalance_threshold: u64,
        ctx: &mut TxContext,
    ) {
        let vault = VaultState {
            id: object::new(ctx),
            sui_balance: balance::zero<SUI>(),
            agent,
            is_active: true,
            target_sui_pct,
            rebalance_threshold,
            total_deposits: 0,
            rebalance_count: 0,
        };
        transfer::share_object(vault);
    }

    /// Update agent address
    public entry fun set_agent(
        _admin: &AdminCap,
        vault: &mut VaultState,
        new_agent: address,
    ) {
        vault.agent = new_agent;
    }

    /// Update target allocation
    public entry fun set_target_allocation(
        _admin: &AdminCap,
        vault: &mut VaultState,
        target_sui_pct: u64,
        rebalance_threshold: u64,
    ) {
        vault.target_sui_pct = target_sui_pct;
        vault.rebalance_threshold = rebalance_threshold;
    }

    /// Pause/unpause vault
    public entry fun set_active(
        _admin: &AdminCap,
        vault: &mut VaultState,
        active: bool,
    ) {
        vault.is_active = active;
    }

    // ======== User Functions ========

    /// Deposit SUI into the vault
    public entry fun deposit(
        vault: &mut VaultState,
        payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        assert!(vault.is_active, E_VAULT_PAUSED);
        let amount = coin::value(&payment);
        assert!(amount > 0, E_ZERO_AMOUNT);

        // Add to vault balance
        let payment_balance = coin::into_balance(payment);
        balance::join(&mut vault.sui_balance, payment_balance);
        vault.total_deposits = vault.total_deposits + amount;

        // Create deposit receipt
        let receipt = DepositReceipt {
            id: object::new(ctx),
            owner: ctx.sender(),
            amount,
            deposit_time: 0, // Would use clock in production
        };
        transfer::transfer(receipt, ctx.sender());

        event::emit(DepositEvent {
            depositor: ctx.sender(),
            amount,
            vault_total: balance::value(&vault.sui_balance),
        });
    }

    /// Withdraw SUI from the vault using deposit receipt
    public entry fun withdraw(
        vault: &mut VaultState,
        receipt: DepositReceipt,
        ctx: &mut TxContext,
    ) {
        let DepositReceipt { id, owner: _, amount, deposit_time: _ } = receipt;
        object::delete(id);

        assert!(balance::value(&vault.sui_balance) >= amount, E_INSUFFICIENT_BALANCE);

        let withdrawn = balance::split(&mut vault.sui_balance, amount);
        let coin = coin::from_balance(withdrawn, ctx);
        transfer::public_transfer(coin, ctx.sender());

        event::emit(WithdrawEvent {
            withdrawer: ctx.sender(),
            amount,
            vault_total: balance::value(&vault.sui_balance),
        });
    }

    // ======== Agent Functions ========

    /// Agent executes a rebalance - swaps SUI on DeepBook
    /// In production this would call DeepBook directly via PTB
    /// For hackathon: agent withdraws, trades off-chain, deposits back
    public entry fun agent_rebalance(
        vault: &mut VaultState,
        amount: u64,
        action: vector<u8>,
        price_signal: u64,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == vault.agent, E_NOT_AGENT);
        assert!(balance::value(&vault.sui_balance) >= amount, E_INSUFFICIENT_BALANCE);

        // Withdraw for rebalance
        let rebalance_coin = coin::from_balance(
            balance::split(&mut vault.sui_balance, amount),
            ctx,
        );
        transfer::public_transfer(rebalance_coin, vault.agent);

        vault.rebalance_count = vault.rebalance_count + 1;

        event::emit(AgentRebalanceEvent {
            action,
            amount_in: amount,
            amount_out: 0, // Updated after trade completes
            price_signal,
            timestamp: 0,
        });
    }

    /// Agent deposits back after rebalance/cross-chain return
    public entry fun agent_deposit_back(
        vault: &mut VaultState,
        payment: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == vault.agent, E_NOT_AGENT);
        let payment_balance = coin::into_balance(payment);
        balance::join(&mut vault.sui_balance, payment_balance);
    }

    /// Agent logs a cross-chain action (executed off-chain via LI.FI)
    public entry fun agent_log_cross_chain(
        vault: &mut VaultState,
        action: vector<u8>,
        amount: u64,
        target_chain: vector<u8>,
        reason: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(ctx.sender() == vault.agent, E_NOT_AGENT);

        event::emit(AgentCrossChainEvent {
            action,
            amount,
            target_chain,
            reason,
        });
    }

    // ======== View Functions ========

    public fun vault_balance(vault: &VaultState): u64 {
        balance::value(&vault.sui_balance)
    }

    public fun vault_agent(vault: &VaultState): address {
        vault.agent
    }

    public fun vault_is_active(vault: &VaultState): bool {
        vault.is_active
    }

    public fun vault_target_sui_pct(vault: &VaultState): u64 {
        vault.target_sui_pct
    }

    public fun vault_rebalance_count(vault: &VaultState): u64 {
        vault.rebalance_count
    }

    public fun vault_total_deposits(vault: &VaultState): u64 {
        vault.total_deposits
    }

    public fun receipt_amount(receipt: &DepositReceipt): u64 {
        receipt.amount
    }

    public fun receipt_owner(receipt: &DepositReceipt): address {
        receipt.owner
    }
}
