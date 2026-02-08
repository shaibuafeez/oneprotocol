// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title DaraVault — Agentic Treasury on Arc
 * @notice USDC safety vault for DARA AI agent. On Arc, native gas = USDC.
 *         The agent deposits USDC here during volatile markets (backed by US Treasuries),
 *         and withdraws to redeploy to Sui yield protocols when conditions improve.
 */
contract DaraVault {
    address public owner;
    address public agent;

    uint256 public totalDeposited;
    uint256 public totalWithdrawn;
    uint256 public actionCount;
    uint256 public lastActionTimestamp;
    string public lastDecisionReason;

    struct Decision {
        uint256 timestamp;
        string action;
        uint256 riskScore;
        string reason;
        uint256 amount;
    }

    Decision[] public decisions;

    event Deposited(address indexed from, uint256 amount, string reason, uint256 timestamp);
    event Withdrawn(address indexed to, uint256 amount, string reason, uint256 timestamp);
    event TreasuryDecision(string action, uint256 riskScore, string reason, uint256 timestamp);

    modifier onlyAuthorized() {
        require(msg.sender == owner || msg.sender == agent, "Not authorized");
        _;
    }

    constructor(address _agent) {
        owner = msg.sender;
        agent = _agent;
    }

    /// @notice Deposit USDC into the safety vault (msg.value on Arc = USDC)
    function deposit(string calldata reason) external payable onlyAuthorized {
        require(msg.value > 0, "Zero deposit");
        totalDeposited += msg.value;
        actionCount++;
        lastActionTimestamp = block.timestamp;
        lastDecisionReason = reason;

        decisions.push(Decision({
            timestamp: block.timestamp,
            action: "DEPOSIT",
            riskScore: 0,
            reason: reason,
            amount: msg.value
        }));

        emit Deposited(msg.sender, msg.value, reason, block.timestamp);
    }

    /// @notice Withdraw USDC from vault to redeploy to yield
    function withdraw(uint256 amount, string calldata reason) external onlyAuthorized {
        require(amount > 0 && amount <= address(this).balance, "Invalid amount");
        totalWithdrawn += amount;
        actionCount++;
        lastActionTimestamp = block.timestamp;
        lastDecisionReason = reason;

        decisions.push(Decision({
            timestamp: block.timestamp,
            action: "WITHDRAW",
            riskScore: 0,
            reason: reason,
            amount: amount
        }));

        payable(msg.sender).transfer(amount);
        emit Withdrawn(msg.sender, amount, reason, block.timestamp);
    }

    /// @notice Log an autonomous decision on-chain
    function logDecision(string calldata action, uint256 riskScore, string calldata reason) external onlyAuthorized {
        actionCount++;
        lastActionTimestamp = block.timestamp;
        lastDecisionReason = reason;

        decisions.push(Decision({
            timestamp: block.timestamp,
            action: action,
            riskScore: riskScore,
            reason: reason,
            amount: 0
        }));

        emit TreasuryDecision(action, riskScore, reason, block.timestamp);
    }

    /// @notice View treasury health
    function treasuryHealth() external view returns (
        uint256 balance,
        uint256 deposited,
        uint256 withdrawn,
        uint256 actions,
        uint256 lastAction,
        uint256 decisionCount
    ) {
        return (
            address(this).balance,
            totalDeposited,
            totalWithdrawn,
            actionCount,
            lastActionTimestamp,
            decisions.length
        );
    }

    /// @notice Get recent decisions (last N)
    function getRecentDecisions(uint256 count) external view returns (Decision[] memory) {
        uint256 len = decisions.length;
        uint256 start = len > count ? len - count : 0;
        uint256 size = len - start;
        Decision[] memory recent = new Decision[](size);
        for (uint256 i = 0; i < size; i++) {
            recent[i] = decisions[start + i];
        }
        return recent;
    }

    /// @notice Update agent address
    function setAgent(address _agent) external {
        require(msg.sender == owner, "Only owner");
        agent = _agent;
    }

    receive() external payable {}
}
