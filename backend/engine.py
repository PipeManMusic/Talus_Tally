class PriorityEngine:
    @staticmethod
    def calculate_task_score(sub_p_priority: int, wp_importance: int, task: any) -> float:
        """
        Calculates a global priority score based on Hierarchy and Money.
        Higher Score = Do This First.
        """
        # 1. Hierarchy Weight (The "Base" Score)
        # Keeps high-priority sub-projects (like Brakes) above low ones (like Stereo)
        hierarchy_score = (sub_p_priority * 100) + (wp_importance * 10) + task.importance
        
        # 2. Financial Velocity: (Budget Priority / (Cost + 1)) 
        # Prioritizes high-need items that are cheap (Quick Wins).
        # We add +1 to cost to prevent division by zero on free tasks.
        financial_velocity = task.budget_priority / (task.estimated_cost + 1)
        
        # Weight the financial velocity significantly to bubble up "Quick Wins"
        return hierarchy_score + (financial_velocity * 20)

    def get_sorted_tasks(self, project: any) -> list:
        """
        Flattens the hierarchy into a sorted list for the Android App.
        """
        flattened = []
        for sub_p in project.sub_projects:
            for wp in sub_p.work_packages:
                for task in wp.tasks:
                    # Skip completed tasks in the main view
                    if task.status == "Complete":
                        continue
                        
                    score = self.calculate_task_score(sub_p.priority, wp.importance, task)
                    
                    flattened.append({
                        "id": task.id,
                        "text": task.text,
                        "status": task.status,
                        "cost": task.estimated_cost,
                        "parent_wp": wp.name,
                        "parent_sub": sub_p.name,
                        "global_score": score
                    })
        
        # Sort by score descending (Highest Priority First)
        return sorted(flattened, key=lambda x: x['global_score'], reverse=True)
